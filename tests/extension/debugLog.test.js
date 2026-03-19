import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDebugLogStore,
  appendDebugLog,
  snapshotDebugLog,
  summarizeRecordForDebug
} from '../../src/extension/debugLog.js';

test('debug log store should keep only the most recent entries', () => {
  const store = createDebugLogStore(2);

  appendDebugLog(store, 'first', { value: 1 });
  appendDebugLog(store, 'second', { value: 2 });
  appendDebugLog(store, 'third', { value: 3 });

  const snapshot = snapshotDebugLog(store);
  assert.equal(snapshot.length, 2);
  assert.deepEqual(snapshot.map((entry) => entry.type), ['second', 'third']);
});

test('debug log store should sanitize nested values and errors', () => {
  const store = createDebugLogStore(5);

  appendDebugLog(store, 'error', {
    error: new Error('boom'),
    blob: { type: 'image/jpeg', size: 15, arrayBuffer() {} },
    deep: { a: { b: { c: { d: 'trim-me' } } } }
  });

  const [entry] = snapshotDebugLog(store);
  assert.equal(entry.payload.error.message, 'boom');
  assert.equal(entry.payload.blob.type, 'image/jpeg');
  assert.equal(entry.payload.blob.size, 15);
  assert.equal(typeof entry.payload.deep.a.b, 'string');
});

test('summarizeRecordForDebug should expose compact record state', () => {
  const summary = summarizeRecordForDebug({
    id: '1',
    status: 'processing_error',
    currentVariant: 'original',
    sourceUrl: 'https://lh3.googleusercontent.com/gg/example=s1024-rj',
    normalizedSourceUrl: 'https://lh3.googleusercontent.com/gg/example=s1024-rj',
    error: 'Failed to decode image blob',
    debug: {
      sourceStrategy: 'background-fetch',
      originalBlob: { type: 'image/jpeg', size: 15 }
    },
    dom: {
      image: {
        tagName: 'IMG',
        src: 'https://lh3.googleusercontent.com/gg/example=s1024-rj',
        currentSrc: 'https://lh3.googleusercontent.com/gg/example=s1024-rj',
        naturalWidth: 1024,
        naturalHeight: 1024
      },
      status: {
        textContent: '处理异常：Failed to decode image blob'
      }
    }
  });

  assert.equal(summary.id, '1');
  assert.equal(summary.status, 'processing_error');
  assert.equal(summary.media.tagName, 'IMG');
  assert.equal(summary.debug.originalBlob.size, 15);
  assert.equal(summary.statusText, '处理异常：Failed to decode image blob');
});
