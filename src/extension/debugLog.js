function truncateString(value, maxLength = 240) {
  if (typeof value !== 'string') return value;
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function sanitizeValue(value, depth = 0) {
  if (value == null) return value;
  if (depth >= 3) {
    return typeof value === 'string' ? truncateString(value) : '[max-depth]';
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncateString(value.message),
      stack: truncateString(value.stack || '', 400)
    };
  }

  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return {
      type: value.type,
      size: value.size
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 12).map((item) => sanitizeValue(item, depth + 1));
  }

  if (typeof value === 'string') {
    return truncateString(value);
  }

  if (typeof value !== 'object') {
    return value;
  }

  const out = {};
  for (const [key, entry] of Object.entries(value).slice(0, 16)) {
    if (typeof entry === 'function') continue;
    out[key] = sanitizeValue(entry, depth + 1);
  }
  return out;
}

export function createDebugLogStore(limit = 80) {
  return {
    limit,
    entries: []
  };
}

export function appendDebugLog(store, type, payload = {}) {
  store.entries.push({
    timestamp: new Date().toISOString(),
    type,
    payload: sanitizeValue(payload)
  });

  if (store.entries.length > store.limit) {
    store.entries.splice(0, store.entries.length - store.limit);
  }
}

export function snapshotDebugLog(store) {
  return store.entries.map((entry) => ({
    ...entry,
    payload: sanitizeValue(entry.payload)
  }));
}

export function summarizeRecordForDebug(record) {
  const image = record?.dom?.image || null;
  return {
    id: record?.id || '',
    status: record?.status || '',
    currentVariant: record?.currentVariant || '',
    sourceUrl: record?.sourceUrl || '',
    normalizedSourceUrl: record?.normalizedSourceUrl || '',
    error: record?.error || '',
    statusText: record?.dom?.status?.textContent?.trim() || '',
    media: image ? {
      tagName: image.tagName || '',
      src: image.src || '',
      currentSrc: image.currentSrc || '',
      naturalWidth: image.naturalWidth || image.width || 0,
      naturalHeight: image.naturalHeight || image.height || 0
    } : null,
    debug: sanitizeValue(record?.debug || {})
  };
}
