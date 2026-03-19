import { normalizeErrorMessage } from './errorUtils.js';

const READY_PROCESSED = 'ready_processed';
const READY_ORIGINAL = 'ready_original';

function cloneRecord(record, updates = {}) {
  return {
    ...record,
    ...updates
  };
}

function ensureRecord(record) {
  if (!record || typeof record !== 'object') {
    throw new TypeError('image record is required');
  }
  return record;
}

function getReadyStatusForVariant(variant) {
  return variant === 'original' ? READY_ORIGINAL : READY_PROCESSED;
}

export function createImageRecord({ id, sourceUrl }) {
  return {
    id,
    sourceUrl,
    normalizedSourceUrl: sourceUrl,
    originalBlob: null,
    processedBlob: null,
    originalObjectUrl: null,
    processedObjectUrl: null,
    status: 'idle',
    currentVariant: 'original',
    error: null,
    dom: null
  };
}

export function startProcessing(record) {
  const current = ensureRecord(record);
  return cloneRecord(current, {
    status: 'processing',
    currentVariant: 'original',
    error: null
  });
}

export function finishProcessing(record, updates = {}) {
  const current = ensureRecord(record);
  return cloneRecord(current, {
    ...updates,
    status: READY_PROCESSED,
    currentVariant: 'processed',
    error: null
  });
}

export function failProcessing(record, error) {
  const current = ensureRecord(record);
  return cloneRecord(current, {
    status: 'processing_error',
    currentVariant: 'original',
    error: normalizeErrorMessage(error)
  });
}

export function toggleVariant(record) {
  const current = ensureRecord(record);
  if (current.status !== READY_PROCESSED && current.status !== READY_ORIGINAL) {
    return current;
  }

  const nextVariant = current.currentVariant === 'processed' ? 'original' : 'processed';
  return cloneRecord(current, {
    currentVariant: nextVariant,
    status: getReadyStatusForVariant(nextVariant)
  });
}

export function beginCopy(record) {
  const current = ensureRecord(record);
  return cloneRecord(current, { status: 'copy_pending' });
}

export function finishCopy(record) {
  const current = ensureRecord(record);
  return cloneRecord(current, {
    status: getReadyStatusForVariant(current.currentVariant || 'processed')
  });
}

export function beginDownload(record) {
  const current = ensureRecord(record);
  return cloneRecord(current, { status: 'download_pending' });
}

export function finishDownload(record) {
  const current = ensureRecord(record);
  return cloneRecord(current, {
    status: getReadyStatusForVariant(current.currentVariant || 'processed')
  });
}

export function getActionAvailability(record) {
  const current = ensureRecord(record);

  if (current.status === 'ready_processed' || current.status === 'ready_original') {
    return {
      canToggle: true,
      canCopy: true,
      canDownload: true
    };
  }

  if (current.status === 'processing_error') {
    return {
      canToggle: false,
      canCopy: true,
      canDownload: true
    };
  }

  return {
    canToggle: false,
    canCopy: false,
    canDownload: false
  };
}
