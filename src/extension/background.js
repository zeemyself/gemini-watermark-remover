import { normalizeErrorMessage } from './errorUtils.js';

export function createBackgroundMessageHandler({
  fetchImpl = globalThis.fetch,
  downloadsApi = globalThis.chrome?.downloads,
  tabsApi = globalThis.chrome?.tabs
} = {}) {
  return async function handleBackgroundMessage(message, sender) {
    if (message?.type === 'gwr:fetch-image') {
      if (typeof fetchImpl !== 'function') {
        throw new Error('fetch API unavailable');
      }

      const response = await fetchImpl(message.url, {
        credentials: 'include',
        redirect: 'follow'
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }

      const mimeType = response.headers.get('content-type') || 'image/png';
      const normalizedMimeType = mimeType.toLowerCase();
      if (
        normalizedMimeType
        && !normalizedMimeType.startsWith('image/')
        && normalizedMimeType !== 'application/octet-stream'
      ) {
        throw new Error(`Unexpected content type: ${mimeType.split(';')[0]}`);
      }

      const buffer = await response.arrayBuffer();
      return {
        ok: true,
        buffer,
        mimeType
      };
    }

    if (message?.type === 'gwr:download-data-url') {
      if (!downloadsApi?.download) {
        throw new Error('chrome.downloads API unavailable');
      }

      const downloadId = await downloadsApi.download({
        url: message.dataUrl,
        filename: message.filename,
        saveAs: false,
        conflictAction: 'uniquify'
      });

      return {
        ok: true,
        downloadId
      };
    }

    if (message?.type === 'gwr:capture-visible-tab') {
      if (!tabsApi?.captureVisibleTab) {
        throw new Error('chrome.tabs.captureVisibleTab API unavailable');
      }

      const dataUrl = await tabsApi.captureVisibleTab(sender?.tab?.windowId, {
        format: 'png'
      });

      return {
        ok: true,
        dataUrl
      };
    }

    return null;
  };
}

const backgroundMessageHandler = createBackgroundMessageHandler();

if (typeof chrome !== 'undefined' && chrome?.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
      try {
        const response = await backgroundMessageHandler(message, sender);
        sendResponse(response);
      } catch (error) {
        sendResponse({
          ok: false,
          error: normalizeErrorMessage(error, 'Unknown background error')
        });
      }
    })();

    return true;
  });
}
