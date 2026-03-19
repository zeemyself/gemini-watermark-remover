import { installPageImageReplacement } from './pageImageReplacement.js';

const PAGE_HOOK_EVENT = 'gwr:page-hook-state';
const MAX_DEBUG_LOGS = 50;

const summary = {
  installed: false,
  total: 0,
  ready: 0,
  failed: 0,
  lastPhase: '',
  lastError: '',
  lastNormalizedUrl: '',
  updatedAt: '',
  logs: []
};

const debugLogs = [];

function markContentScriptState(state, errorMessage = '') {
  const root = document.documentElement;
  if (!root?.dataset) return;
  root.dataset.gwrContentScriptState = state;
  if (errorMessage) {
    root.dataset.gwrContentScriptError = errorMessage;
  } else {
    delete root.dataset.gwrContentScriptError;
  }
}

function appendDebugLog(type, payload = {}) {
  debugLogs.push({
    type,
    payload,
    at: new Date().toISOString()
  });
  if (debugLogs.length > MAX_DEBUG_LOGS) {
    debugLogs.splice(0, debugLogs.length - MAX_DEBUG_LOGS);
  }
}

function forwardPageImageLog(type, payload = {}) {
  appendDebugLog(type, payload);
}

function normalizeBoolean(value) {
  return value === true || value === 'true';
}

function normalizeCount(value) {
  const count = Number.parseInt(String(value ?? '0'), 10);
  return Number.isFinite(count) ? count : 0;
}

function normalizeSummary(input = {}) {
  return {
    installed: normalizeBoolean(input.installed),
    total: normalizeCount(input.total ?? input.intercepted),
    ready: normalizeCount(input.ready ?? input.succeeded),
    failed: normalizeCount(input.failed),
    lastPhase: typeof input.lastPhase === 'string' ? input.lastPhase : '',
    lastError: typeof input.lastError === 'string' ? input.lastError : '',
    lastNormalizedUrl: typeof input.lastNormalizedUrl === 'string' ? input.lastNormalizedUrl : '',
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : '',
    logs: Array.isArray(input.logs) ? input.logs.slice(-20) : []
  };
}

function readSummaryFromDataset(root = document.documentElement) {
  const dataset = root?.dataset || {};
  return normalizeSummary({
    installed: dataset.gwrHookInstalled,
    total: dataset.gwrHookIntercepted,
    ready: dataset.gwrHookSucceeded,
    failed: dataset.gwrHookFailed,
    lastError: dataset.gwrHookLastError,
    lastNormalizedUrl: dataset.gwrHookLastNormalizedUrl,
    updatedAt: dataset.gwrHookUpdatedAt
  });
}

function updateDebugBridgeMeta() {
  const root = document.documentElement;
  if (!root?.dataset) return;
  root.dataset.gwrDebugBridge = 'ready';
  root.dataset.gwrDebugTotal = String(summary.total);
  root.dataset.gwrDebugReady = String(summary.ready);
  root.dataset.gwrDebugFailed = String(summary.failed);
  root.dataset.gwrDebugPhase = summary.lastPhase || '';
  root.dataset.gwrDebugUpdatedAt = summary.updatedAt || new Date().toISOString();
}

function applySummary(nextSummary, reason) {
  Object.assign(summary, normalizeSummary(nextSummary));
  updateDebugBridgeMeta();
  appendDebugLog('summary-update', {
    reason,
    summary: { ...summary }
  });
}

function buildDebugSnapshot() {
  return {
    generatedAt: new Date().toISOString(),
    summary: { ...summary },
    records: [],
    logs: [
      ...debugLogs,
      ...summary.logs.map((entry) => ({
        type: 'page-hook-log',
        payload: entry,
        at: entry?.at || new Date().toISOString()
      }))
    ]
  };
}

function installDebugBridge() {
  updateDebugBridgeMeta();
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.type !== 'gwr:debug-request') return;

    window.postMessage({
      type: 'gwr:debug-response',
      requestId: event.data.requestId,
      payload: buildDebugSnapshot()
    }, '*');
  });
}

function handlePageHookState(event) {
  applySummary(event?.detail || {}, 'page-hook-event');
}

function installRuntimeBridge() {
  if (!chrome?.runtime?.onMessage?.addListener) return;
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'gwr:get-summary') {
      sendResponse({ ...summary });
      return undefined;
    }

    if (message?.type === 'gwr:get-debug-state') {
      sendResponse(buildDebugSnapshot());
      return undefined;
    }

    if (message?.type === 'gwr:download-all-processed') {
      sendResponse({
        ok: false,
        error: '当前 hook 模式不支持批量下载'
      });
      return undefined;
    }

    return undefined;
  });
}

function initContentScript() {
  markContentScriptState('initializing');
  try {
    installDebugBridge();
    installRuntimeBridge();
    installPageImageReplacement({
      logger: console,
      onLog: forwardPageImageLog
    });
    window.addEventListener(PAGE_HOOK_EVENT, handlePageHookState);
    applySummary(readSummaryFromDataset(), 'dataset-init');
    markContentScriptState('ready');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || 'content script init failed');
    markContentScriptState('failed', message);
    appendDebugLog('content-script-failed', { message });
    console.error('[Gemini Watermark Remover] content script init failed:', error);
  }
}

markContentScriptState('booting');
initContentScript();
