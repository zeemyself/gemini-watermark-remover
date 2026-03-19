import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldHideNativeImageActions } from '../../src/extension/nativeButtons.js';

test('native Gemini image actions should be hidden only when extension controls are ready', () => {
  assert.equal(shouldHideNativeImageActions({
    controlsInjected: true,
    controlsReady: true,
    showNativeButtons: false,
    hasRuntimeError: false
  }), true);
});

test('native Gemini image actions should stay visible when user prefers native buttons', () => {
  assert.equal(shouldHideNativeImageActions({
    controlsInjected: true,
    controlsReady: true,
    showNativeButtons: true,
    hasRuntimeError: false
  }), false);
});

test('native Gemini image actions should stay visible when extension controls are not ready', () => {
  assert.equal(shouldHideNativeImageActions({
    controlsInjected: false,
    controlsReady: false,
    showNativeButtons: false,
    hasRuntimeError: false
  }), false);
});

test('native Gemini image actions should stay visible after runtime errors', () => {
  assert.equal(shouldHideNativeImageActions({
    controlsInjected: true,
    controlsReady: true,
    showNativeButtons: false,
    hasRuntimeError: true
  }), false);
});
