import { createGeminiDownloadFetchHook } from '../userscript/downloadHook.js';
import {
  isGeminiGeneratedAssetUrl,
  normalizeGoogleusercontentImageUrl
} from '../userscript/urlUtils.js';
import { removeWatermarkFromBlob } from './imageProcessing.js';

const PAGE_HOOK_EVENT = 'gwr:page-hook-state';
const PAGE_HOOK_FLAG = '__gwrPageHookInstalled__';
const PAGE_FETCH_REQUEST = 'gwr:page-fetch-request';
const PAGE_FETCH_RESPONSE = 'gwr:page-fetch-response';
const PAGE_FETCH_BRIDGE_FLAG = '__gwrPageFetchBridgeInstalled__';

function buildInitialState() {
  return {
    installed: false,
    intercepted: 0,
    succeeded: 0,
    failed: 0,
    lastPhase: '',
    lastError: '',
    lastNormalizedUrl: '',
    updatedAt: '',
    logs: []
  };
}

function normalizeErrorMessage(error) {
  return error instanceof Error ? error.message : String(error || '');
}

function createLogEntry(phase, payload = {}) {
  return {
    phase,
    at: new Date().toISOString(),
    ...payload
  };
}

function appendStateLog(state, entry, limit = 20) {
  const logs = [...(state.logs || []), entry];
  if (logs.length <= limit) return logs;
  return logs.slice(logs.length - limit);
}

function syncDataset(documentElement, state) {
  if (!documentElement?.dataset) return;
  documentElement.dataset.gwrHookInstalled = state.installed ? 'true' : 'false';
  documentElement.dataset.gwrHookIntercepted = String(state.intercepted);
  documentElement.dataset.gwrHookSucceeded = String(state.succeeded);
  documentElement.dataset.gwrHookFailed = String(state.failed);
  documentElement.dataset.gwrHookLastPhase = state.lastPhase || '';
  documentElement.dataset.gwrHookLastError = state.lastError || '';
  documentElement.dataset.gwrHookLastNormalizedUrl = state.lastNormalizedUrl || '';
  documentElement.dataset.gwrHookUpdatedAt = state.updatedAt || '';
}

function dispatchState(dispatchEvent, state) {
  if (typeof dispatchEvent !== 'function') return;
  const payload = { ...state };
  if (typeof CustomEvent === 'function') {
    dispatchEvent(new CustomEvent(PAGE_HOOK_EVENT, { detail: payload }));
    return;
  }
  dispatchEvent({ type: PAGE_HOOK_EVENT, detail: payload });
}

export function createPageFetchBridgeHandler({
  originalFetch,
  postMessage = globalThis.window?.postMessage?.bind(globalThis.window) || null,
  sourceWindow = globalThis.window || null
} = {}) {
  return async function handlePageFetchBridgeEvent(event) {
    if (!event?.data || event.data.type !== PAGE_FETCH_REQUEST) {
      return;
    }
    if (sourceWindow && event.source && event.source !== sourceWindow) {
      return;
    }
    if (typeof originalFetch !== 'function' || typeof postMessage !== 'function') {
      return;
    }

    const requestId = typeof event.data.requestId === 'string' ? event.data.requestId : '';
    const url = typeof event.data.url === 'string' ? event.data.url : '';
    if (!requestId || !url) {
      return;
    }

    try {
      const response = await originalFetch(url, {
        credentials: 'omit',
        redirect: 'follow',
        gwrBypass: true
      });

      if (!response?.ok) {
        throw new Error(`Page fetch failed: ${response?.status || 0}`);
      }

      const mimeType = response.headers.get('content-type') || 'application/octet-stream';
      const buffer = await response.arrayBuffer();
      postMessage({
        type: PAGE_FETCH_RESPONSE,
        requestId,
        ok: true,
        mimeType,
        buffer
      }, '*');
    } catch (error) {
      postMessage({
        type: PAGE_FETCH_RESPONSE,
        requestId,
        ok: false,
        error: normalizeErrorMessage(error)
      }, '*');
    }
  };
}

function installPageFetchBridge(targetWindow, originalFetch) {
  if (!targetWindow || typeof targetWindow.addEventListener !== 'function') {
    return;
  }
  if (targetWindow[PAGE_FETCH_BRIDGE_FLAG]) {
    return;
  }

  const handler = createPageFetchBridgeHandler({
    originalFetch,
    postMessage: targetWindow.postMessage?.bind(targetWindow) || null,
    sourceWindow: targetWindow
  });

  targetWindow.addEventListener('message', (event) => {
    void handler(event);
  });
  targetWindow[PAGE_FETCH_BRIDGE_FLAG] = true;
}

export function createPageHookStateReporter({
  documentElement = globalThis.document?.documentElement || null,
  dispatchEvent = globalThis.window?.dispatchEvent?.bind(globalThis.window) || null
} = {}) {
  let state = buildInitialState();

  function commit(patch) {
    state = {
      ...state,
      ...patch,
      updatedAt: new Date().toISOString()
    };
    syncDataset(documentElement, state);
    dispatchState(dispatchEvent, state);
    return state;
  }

  commit({
    installed: true,
    lastPhase: 'installed',
    logs: appendStateLog(state, createLogEntry('installed'))
  });

  return {
    markIntercept({ sourceUrl = '', normalizedUrl = '', blob = null } = {}) {
      commit({
        intercepted: state.intercepted + 1,
        lastNormalizedUrl: normalizedUrl || state.lastNormalizedUrl,
        lastPhase: 'intercept',
        lastError: '',
        logs: appendStateLog(state, createLogEntry('intercept', {
          sourceUrl,
          normalizedUrl,
          blobType: blob?.type || '',
          blobSize: blob?.size || 0
        }))
      });
    },
    markDecodeStart({ normalizedUrl = '', blob = null } = {}) {
      commit({
        lastNormalizedUrl: normalizedUrl || state.lastNormalizedUrl,
        lastPhase: 'decode',
        lastError: '',
        logs: appendStateLog(state, createLogEntry('decode', {
          normalizedUrl,
          blobType: blob?.type || '',
          blobSize: blob?.size || 0
        }))
      });
    },
    markSuccess({ normalizedUrl = '', processedBlob = null } = {}) {
      commit({
        succeeded: state.succeeded + 1,
        lastNormalizedUrl: normalizedUrl || state.lastNormalizedUrl,
        lastPhase: 'success',
        lastError: '',
        logs: appendStateLog(state, createLogEntry('success', {
          normalizedUrl,
          blobType: processedBlob?.type || '',
          blobSize: processedBlob?.size || 0
        }))
      });
    },
    markFailure(error, { sourceUrl = '', normalizedUrl = '', blob = null } = {}) {
      commit({
        failed: state.failed + 1,
        lastNormalizedUrl: normalizedUrl || state.lastNormalizedUrl,
        lastPhase: 'failure',
        lastError: normalizeErrorMessage(error),
        logs: appendStateLog(state, createLogEntry('failure', {
          sourceUrl,
          normalizedUrl,
          error: normalizeErrorMessage(error),
          blobType: blob?.type || '',
          blobSize: blob?.size || 0
        }))
      });
    },
    snapshot() {
      return {
        ...state,
        logs: [...state.logs]
      };
    }
  };
}

export function createExtensionPageFetchHook({
  originalFetch,
  removeWatermarkFromBlob: removeWatermarkFromBlobImpl = removeWatermarkFromBlob,
  reporter = createPageHookStateReporter(),
  logger = console
} = {}) {
  logger?.info?.('[Gemini Watermark Remover] page hook ready');
  return createGeminiDownloadFetchHook({
    originalFetch,
    isTargetUrl: isGeminiGeneratedAssetUrl,
    normalizeUrl: normalizeGoogleusercontentImageUrl,
    processBlob: async (blob, context = {}) => {
      logger?.info?.('[Gemini Watermark Remover] intercept start', {
        sourceUrl: context.url || '',
        normalizedUrl: context.normalizedUrl || '',
        blobType: blob?.type || '',
        blobSize: blob?.size || 0
      });
      reporter.markIntercept({
        sourceUrl: context.url || '',
        normalizedUrl: context.normalizedUrl,
        blob
      });
      try {
        reporter.markDecodeStart({
          normalizedUrl: context.normalizedUrl,
          blob
        });
        const processedBlob = await removeWatermarkFromBlobImpl(blob);
        reporter.markSuccess({
          normalizedUrl: context.normalizedUrl,
          processedBlob
        });
        logger?.info?.('[Gemini Watermark Remover] intercept success', {
          normalizedUrl: context.normalizedUrl || '',
          blobType: processedBlob?.type || '',
          blobSize: processedBlob?.size || 0
        });
        return processedBlob;
      } catch (error) {
        reporter.markFailure(error, {
          sourceUrl: context.url || '',
          normalizedUrl: context.normalizedUrl,
          blob
        });
        logger?.warn?.('[Gemini Watermark Remover] intercept failed', {
          sourceUrl: context.url || '',
          normalizedUrl: context.normalizedUrl || '',
          blobType: blob?.type || '',
          blobSize: blob?.size || 0,
          error: normalizeErrorMessage(error)
        });
        throw error;
      }
    },
    logger
  });
}

export function installExtensionPageHook(targetWindow = globalThis.window, options = {}) {
  if (!targetWindow || typeof targetWindow !== 'object') {
    throw new TypeError('targetWindow must be an object');
  }
  if (targetWindow[PAGE_HOOK_FLAG]) {
    return targetWindow.fetch;
  }

  const originalFetch = typeof targetWindow.fetch === 'function'
    ? targetWindow.fetch.bind(targetWindow)
    : null;
  if (!originalFetch) {
    throw new Error('window.fetch is unavailable');
  }

  const hook = createExtensionPageFetchHook({
    ...options,
    originalFetch
  });

  targetWindow.fetch = hook;
  targetWindow[PAGE_HOOK_FLAG] = true;
  installPageFetchBridge(targetWindow, originalFetch);
  options.logger?.info?.('[Gemini Watermark Remover] page hook installed');
  return hook;
}

try {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    installExtensionPageHook(window, { logger: console });
  }
} catch (error) {
  console.error('[Gemini Watermark Remover] page hook init failed:', error);
}
