import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createImageRecord,
  startProcessing,
  finishProcessing,
  failProcessing,
  beginCopy,
  finishCopy,
  beginDownload,
  finishDownload,
  toggleVariant,
  getActionAvailability
} from '../../src/extension/imageState.js';

test('new image record should start idle and allow no actions before processing succeeds', () => {
  const record = createImageRecord({
    id: 'img-1',
    sourceUrl: 'https://lh3.googleusercontent.com/rd-gg/example=s1024'
  });

  assert.equal(record.status, 'idle');
  assert.equal(record.currentVariant, 'original');
  assert.deepEqual(getActionAvailability(record), {
    canToggle: false,
    canCopy: false,
    canDownload: false
  });
});

test('successful processing should default to processed variant and enable all actions', () => {
  const record = finishProcessing(startProcessing(createImageRecord({
    id: 'img-2',
    sourceUrl: 'https://lh3.googleusercontent.com/rd-gg/example=s1024'
  })));

  assert.equal(record.status, 'ready_processed');
  assert.equal(record.currentVariant, 'processed');
  assert.deepEqual(getActionAvailability(record), {
    canToggle: true,
    canCopy: true,
    canDownload: true
  });
});

test('toggleVariant should switch between processed and original after successful processing', () => {
  const processed = finishProcessing(startProcessing(createImageRecord({
    id: 'img-3',
    sourceUrl: 'https://lh3.googleusercontent.com/rd-gg/example=s1024'
  })));

  const original = toggleVariant(processed);
  const roundTrip = toggleVariant(original);

  assert.equal(original.status, 'ready_original');
  assert.equal(original.currentVariant, 'original');
  assert.equal(roundTrip.status, 'ready_processed');
  assert.equal(roundTrip.currentVariant, 'processed');
});

test('processing error should keep original visible, disable toggle, and keep copy/download available', () => {
  const record = failProcessing(
    startProcessing(createImageRecord({
      id: 'img-4',
      sourceUrl: 'https://lh3.googleusercontent.com/rd-gg/example=s1024'
    })),
    new Error('boom')
  );

  assert.equal(record.status, 'processing_error');
  assert.equal(record.currentVariant, 'original');
  assert.equal(record.error, 'boom');
  assert.deepEqual(getActionAvailability(record), {
    canToggle: false,
    canCopy: true,
    canDownload: true
  });
});

test('copy and download pending states should disable all actions until the operation completes', () => {
  const ready = finishProcessing(startProcessing(createImageRecord({
    id: 'img-5',
    sourceUrl: 'https://lh3.googleusercontent.com/rd-gg/example=s1024'
  })));

  const copyPending = beginCopy(ready);
  assert.equal(copyPending.status, 'copy_pending');
  assert.deepEqual(getActionAvailability(copyPending), {
    canToggle: false,
    canCopy: false,
    canDownload: false
  });

  const afterCopy = finishCopy(copyPending);
  assert.equal(afterCopy.status, 'ready_processed');

  const downloadPending = beginDownload(afterCopy);
  assert.equal(downloadPending.status, 'download_pending');
  assert.deepEqual(getActionAvailability(downloadPending), {
    canToggle: false,
    canCopy: false,
    canDownload: false
  });

  const afterDownload = finishDownload(downloadPending);
  assert.equal(afterDownload.status, 'ready_processed');
});
