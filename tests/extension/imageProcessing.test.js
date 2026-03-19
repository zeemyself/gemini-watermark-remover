import test from 'node:test';
import assert from 'node:assert/strict';

import { loadImageFromBlob } from '../../src/extension/imageProcessing.js';

test('loadImageFromBlob should fall back to createImageBitmap when Image decode fails', async () => {
  const originalImage = globalThis.Image;
  const originalCreateObjectURL = globalThis.URL.createObjectURL;
  const originalRevokeObjectURL = globalThis.URL.revokeObjectURL;
  const originalCreateImageBitmap = globalThis.createImageBitmap;

  const revoked = [];

  globalThis.URL.createObjectURL = () => 'blob:test';
  globalThis.URL.revokeObjectURL = (url) => revoked.push(url);
  globalThis.Image = class MockImage {
    set src(_value) {
      queueMicrotask(() => {
        this.onerror?.(new Error('decode failed'));
      });
    }
  };
  globalThis.createImageBitmap = async (blob) => ({
    width: 64,
    height: 64,
    blob
  });

  try {
    const blob = new Blob(['fixture'], { type: 'image/png' });
    const result = await loadImageFromBlob(blob);

    assert.equal(result.width, 64);
    assert.equal(result.height, 64);
    assert.equal(result.blob, blob);
    assert.deepEqual(revoked, ['blob:test']);
  } finally {
    globalThis.Image = originalImage;
    globalThis.URL.createObjectURL = originalCreateObjectURL;
    globalThis.URL.revokeObjectURL = originalRevokeObjectURL;
    globalThis.createImageBitmap = originalCreateImageBitmap;
  }
});
