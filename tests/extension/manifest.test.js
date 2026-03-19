import test from 'node:test';
import assert from 'node:assert/strict';

import { buildExtensionManifest } from '../../src/extension/manifest.js';

test('extension manifest should target Manifest V3 with required permissions for screenshot fallback', () => {
  const manifest = buildExtensionManifest({
    version: '1.0.0',
    description: 'Automatically removes watermarks from Gemini AI generated images'
  });

  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['storage', 'downloads']);
  assert.deepEqual(manifest.host_permissions, [
    '<all_urls>',
    'https://gemini.google.com/*',
    'https://business.gemini.google/*',
    'https://*.googleusercontent.com/*',
    'https://lh3.google.com/*'
  ]);
});

test('extension manifest should register content script, background worker, and popup', () => {
  const manifest = buildExtensionManifest({
    version: '1.0.0',
    description: 'Automatically removes watermarks from Gemini AI generated images'
  });

  assert.equal(manifest.background.service_worker, 'background.js');
  assert.equal(manifest.action.default_popup, 'popup.html');
  assert.deepEqual(manifest.content_scripts, [
    {
      matches: [
        'https://gemini.google.com/*',
        'https://business.gemini.google/*'
      ],
      js: ['page-hook.js'],
      run_at: 'document_start',
      world: 'MAIN'
    },
    {
      matches: [
        'https://gemini.google.com/*',
        'https://business.gemini.google/*'
      ],
      js: ['content-script.js'],
      run_at: 'document_start'
    }
  ]);
});
