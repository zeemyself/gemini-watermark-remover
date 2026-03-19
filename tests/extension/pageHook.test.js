import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPageFetchBridgeHandler,
  createExtensionPageFetchHook,
  createPageHookStateReporter
} from '../../src/extension/pageHook.js';

test('createExtensionPageFetchHook should ignore non-Gemini requests without mutating hook state', async () => {
  const reporter = createPageHookStateReporter({
    documentElement: { dataset: {} },
    dispatchEvent() {}
  });
  const calls = [];
  const hook = createExtensionPageFetchHook({
    originalFetch: async (...args) => {
      calls.push(args);
      return new Response('plain', { status: 200 });
    },
    removeWatermarkFromBlob: async () => {
      throw new Error('should not run');
    },
    reporter
  });

  const response = await hook('https://example.com/plain.txt');

  assert.equal(await response.text(), 'plain');
  assert.equal(calls.length, 1);
  assert.equal(reporter.snapshot().intercepted, 0);
  assert.equal(reporter.snapshot().succeeded, 0);
});

test('createExtensionPageFetchHook should update state when Gemini asset processing succeeds', async () => {
  const dispatched = [];
  const loggerCalls = [];
  const reporter = createPageHookStateReporter({
    documentElement: { dataset: {} },
    dispatchEvent(event) {
      dispatched.push(event.type);
    }
  });

  const hook = createExtensionPageFetchHook({
    originalFetch: async () => new Response(new Blob(['original'], { type: 'image/png' }), {
      status: 200,
      headers: { 'content-type': 'image/png' }
    }),
    removeWatermarkFromBlob: async () => new Blob(['processed'], { type: 'image/png' }),
    reporter,
    logger: {
      info(...args) {
        loggerCalls.push(['info', ...args]);
      }
    }
  });

  const response = await hook('https://lh3.googleusercontent.com/rd-gg/example=s1024');

  assert.equal(await response.text(), 'processed');
  assert.equal(reporter.snapshot().installed, true);
  assert.equal(reporter.snapshot().intercepted, 1);
  assert.equal(reporter.snapshot().succeeded, 1);
  assert.equal(reporter.snapshot().failed, 0);
  assert.match(reporter.snapshot().lastNormalizedUrl, /s0/);
  assert.equal(reporter.snapshot().lastPhase, 'success');
  assert.ok(reporter.snapshot().logs.length >= 3);
  assert.ok(dispatched.includes('gwr:page-hook-state'));
  assert.ok(loggerCalls.some((entry) => entry[0] === 'info' && String(entry[1]).includes('intercept start')));
  assert.ok(loggerCalls.some((entry) => entry[0] === 'info' && String(entry[1]).includes('intercept success')));
});

test('createExtensionPageFetchHook should record failure and fall back to original response', async () => {
  const loggerCalls = [];
  const reporter = createPageHookStateReporter({
    documentElement: { dataset: {} },
    dispatchEvent() {}
  });

  const hook = createExtensionPageFetchHook({
    originalFetch: async () => new Response(new Blob(['original'], { type: 'image/png' }), {
      status: 200,
      headers: { 'content-type': 'image/png' }
    }),
    removeWatermarkFromBlob: async () => {
      throw new Error('boom');
    },
    reporter,
    logger: {
      warn(...args) {
        loggerCalls.push(['warn', ...args]);
      }
    }
  });

  const response = await hook('https://lh3.googleusercontent.com/rd-gg/example=s1024');

  assert.equal(await response.text(), 'original');
  assert.equal(reporter.snapshot().intercepted, 1);
  assert.equal(reporter.snapshot().succeeded, 0);
  assert.equal(reporter.snapshot().failed, 1);
  assert.equal(reporter.snapshot().lastError, 'boom');
  assert.equal(reporter.snapshot().lastPhase, 'failure');
  assert.ok(reporter.snapshot().logs.some((entry) => entry.phase === 'failure' && entry.error === 'boom'));
  assert.ok(loggerCalls.some((entry) => entry[0] === 'warn' && String(entry[1]).includes('intercept failed')));
});

test('createPageFetchBridgeHandler should fetch page-context image bytes and dispatch a response message', async () => {
  const dispatched = [];
  const handler = createPageFetchBridgeHandler({
    originalFetch: async (input, init) => {
      assert.equal(input, 'https://lh3.googleusercontent.com/gg/example=s1024-rj');
      assert.equal(init?.gwrBypass, true);
      assert.equal(init?.credentials, 'omit');
      return new Response(new Blob(['image-bytes'], { type: 'image/webp' }), {
        status: 200,
        headers: {
          'content-type': 'image/webp'
        }
      });
    },
    postMessage: (message) => {
      dispatched.push(message);
    }
  });

  await handler({
    source: globalThis.window,
    data: {
      type: 'gwr:page-fetch-request',
      requestId: 'req-1',
      url: 'https://lh3.googleusercontent.com/gg/example=s1024-rj'
    }
  });

  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].type, 'gwr:page-fetch-response');
  assert.equal(dispatched[0].requestId, 'req-1');
  assert.equal(dispatched[0].ok, true);
  assert.equal(dispatched[0].mimeType, 'image/webp');
  assert.deepEqual([...new Uint8Array(dispatched[0].buffer)], [...new TextEncoder().encode('image-bytes')]);
});
