import test from 'node:test';
import assert from 'node:assert/strict';

import { createBackgroundMessageHandler } from '../../src/extension/background.js';

test('background handler should fetch image bytes for fetch-image message', async () => {
  let receivedOptions = null;
  const handler = createBackgroundMessageHandler({
    fetchImpl: async (_url, options) => {
      receivedOptions = options;
      return ({
      ok: true,
      headers: {
        get(name) {
          return name === 'content-type' ? 'image/webp' : null;
        }
      },
      arrayBuffer: async () => new TextEncoder().encode('ok').buffer
      });
    },
    downloadsApi: { download: async () => undefined }
  });

  const response = await handler({
    type: 'gwr:fetch-image',
    url: 'https://lh3.googleusercontent.com/rd-gg/example=s0'
  });

  assert.equal(response.ok, true);
  assert.equal(response.mimeType, 'image/webp');
  assert.deepEqual([...new Uint8Array(response.buffer)], [...new TextEncoder().encode('ok')]);
  assert.deepEqual(receivedOptions, {
    credentials: 'include',
    redirect: 'follow'
  });
});

test('background handler should delegate data-url downloads to chrome downloads api', async () => {
  let receivedOptions = null;
  const handler = createBackgroundMessageHandler({
    fetchImpl: async () => {
      throw new Error('fetch should not be called');
    },
    downloadsApi: {
      download: async (options) => {
        receivedOptions = options;
        return 42;
      }
    }
  });

  const response = await handler({
    type: 'gwr:download-data-url',
    dataUrl: 'data:image/png;base64,AAAA',
    filename: 'unwatermarked-1.png'
  });

  assert.equal(response.ok, true);
  assert.equal(response.downloadId, 42);
  assert.deepEqual(receivedOptions, {
    url: 'data:image/png;base64,AAAA',
    filename: 'unwatermarked-1.png',
    saveAs: false,
    conflictAction: 'uniquify'
  });
});

test('background handler should reject non-image fetch responses early', async () => {
  const handler = createBackgroundMessageHandler({
    fetchImpl: async () => ({
      ok: true,
      headers: {
        get(name) {
          return name === 'content-type' ? 'text/html; charset=utf-8' : null;
        }
      },
      arrayBuffer: async () => new TextEncoder().encode('<html></html>').buffer
    }),
    downloadsApi: { download: async () => undefined }
  });

  await assert.rejects(
    () => handler({
      type: 'gwr:fetch-image',
      url: 'https://lh3.googleusercontent.com/gg/example=s0-rj'
    }),
    /Unexpected content type: text\/html/
  );
});

test('background handler should capture visible tab screenshot', async () => {
  let receivedWindowId = null;
  let receivedOptions = null;
  const handler = createBackgroundMessageHandler({
    fetchImpl: async () => {
      throw new Error('fetch should not be called');
    },
    downloadsApi: { download: async () => undefined },
    tabsApi: {
      captureVisibleTab: async (windowId, options) => {
        receivedWindowId = windowId;
        receivedOptions = options;
        return 'data:image/png;base64,AAAA';
      }
    }
  });

  const response = await handler(
    { type: 'gwr:capture-visible-tab' },
    { tab: { windowId: 9 } }
  );

  assert.equal(response.ok, true);
  assert.equal(response.dataUrl, 'data:image/png;base64,AAAA');
  assert.equal(receivedWindowId, 9);
  assert.deepEqual(receivedOptions, { format: 'png' });
});
