import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveDebugBrowserFlavor,
  getPnpmCommandSpec,
  parseDebugCliArgs,
  resolveDebugBrowserChannel,
  resolveDebugProxySettings
} from '../../scripts/debug-extension-utils.js';

test('getPnpmCommandSpec should use cmd wrapper on Windows', () => {
  const spec = getPnpmCommandSpec('win32', ['build']);

  assert.equal(spec.command, 'cmd.exe');
  assert.deepEqual(spec.args, ['/c', 'pnpm', 'build']);
});

test('getPnpmCommandSpec should call pnpm directly on non-Windows platforms', () => {
  const spec = getPnpmCommandSpec('linux', ['build']);

  assert.equal(spec.command, 'pnpm');
  assert.deepEqual(spec.args, ['build']);
});

test('resolveDebugProxySettings should default to local 7890 proxy', () => {
  const proxy = resolveDebugProxySettings({});

  assert.deepEqual(proxy, {
    server: 'http://127.0.0.1:7890',
    bypass: 'localhost;127.0.0.1'
  });
});

test('resolveDebugProxySettings should allow explicit disable', () => {
  const proxy = resolveDebugProxySettings({ GWR_DEBUG_PROXY: 'off' });

  assert.equal(proxy, undefined);
});

test('resolveDebugBrowserChannel should default to playwright chromium', () => {
  const channel = resolveDebugBrowserChannel({});

  assert.equal(channel, undefined);
});

test('resolveDebugBrowserChannel should respect explicit override', () => {
  const channel = resolveDebugBrowserChannel({ GWR_DEBUG_CHANNEL: 'chrome' });

  assert.equal(channel, 'chrome');
});

test('resolveDebugBrowserFlavor should default to playwright mode', () => {
  const flavor = resolveDebugBrowserFlavor({});

  assert.equal(flavor, 'playwright');
});

test('resolveDebugBrowserFlavor should accept native chrome mode', () => {
  const flavor = resolveDebugBrowserFlavor({ GWR_DEBUG_BROWSER: 'native-chrome' });

  assert.equal(flavor, 'native-chrome');
});

test('parseDebugCliArgs should default to interactive mode without positional command', () => {
  const parsed = parseDebugCliArgs([]);

  assert.deepEqual(parsed, {
    mode: 'interactive',
    targetUrl: '',
    clean: false
  });
});

test('parseDebugCliArgs should support one-shot dump mode', () => {
  const parsed = parseDebugCliArgs(['dump']);

  assert.deepEqual(parsed, {
    mode: 'dump',
    targetUrl: '',
    clean: false
  });
});

test('parseDebugCliArgs should parse open mode target url', () => {
  const parsed = parseDebugCliArgs(['open', 'https://example.com/debug']);

  assert.deepEqual(parsed, {
    mode: 'open',
    targetUrl: 'https://example.com/debug',
    clean: false
  });
});

test('parseDebugCliArgs should preserve clean flag alongside one-shot mode', () => {
  const parsed = parseDebugCliArgs(['--clean', 'screenshot']);

  assert.deepEqual(parsed, {
    mode: 'screenshot',
    targetUrl: '',
    clean: true
  });
});
