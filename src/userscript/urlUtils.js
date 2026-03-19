function isGoogleusercontentHost(hostname) {
  return hostname === 'googleusercontent.com' || hostname.endsWith('.googleusercontent.com');
}

function hasGeminiAssetPath(pathname) {
  return /^\/(?:rd-[^/]+|gg)\//.test(pathname);
}

export function isGeminiGeneratedAssetUrl(url) {
  if (typeof url !== 'string' || url.length === 0) return false;
  try {
    const parsed = new URL(url);
    return isGoogleusercontentHost(parsed.hostname) && hasGeminiAssetPath(parsed.pathname);
  } catch {
    return false;
  }
}

export function normalizeGoogleusercontentImageUrl(url) {
  if (!isGeminiGeneratedAssetUrl(url)) return url;

  try {
    const parsed = new URL(url);
    if (!hasGeminiAssetPath(parsed.pathname)) {
      return url;
    }

    const path = parsed.pathname;
    const dimensionPairAtTail = /=w\d+-h\d+([^/]*)$/i;
    if (dimensionPairAtTail.test(path)) {
      parsed.pathname = path.replace(dimensionPairAtTail, '=s0$1');
      return parsed.toString();
    }

    const sizeTransformAtTail = /=(?:s|w|h)\d+([^/]*)$/i;
    if (sizeTransformAtTail.test(path)) {
      parsed.pathname = path.replace(sizeTransformAtTail, '=s0$1');
      return parsed.toString();
    }

    parsed.pathname = `${path}=s0`;
    return parsed.toString();
  } catch {
    return url;
  }
}
