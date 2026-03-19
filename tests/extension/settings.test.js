import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_EXTENSION_SETTINGS,
  normalizeExtensionSettings
} from '../../src/extension/settings.js';

test('normalizeExtensionSettings should default to hiding native buttons', () => {
  assert.deepEqual(normalizeExtensionSettings({}), DEFAULT_EXTENSION_SETTINGS);
});

test('normalizeExtensionSettings should preserve explicit showNativeButtons preference', () => {
  assert.deepEqual(normalizeExtensionSettings({
    showNativeButtons: true
  }), {
    showNativeButtons: true
  });
});
