import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('package should expose a dedicated extension smoke script', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));

  assert.equal(typeof packageJson.scripts?.['test:extension-smoke'], 'string');
  assert.match(packageJson.scripts['test:extension-smoke'], /tests\/extension\/contentScriptSmoke\.test\.js/);
  assert.equal(typeof packageJson.scripts?.['debug:auto'], 'string');
  assert.match(packageJson.scripts['debug:auto'], /scripts\/debug-extension\.js/);
  assert.equal(typeof packageJson.scripts?.['debug:manual'], 'string');
  assert.match(packageJson.scripts['debug:manual'], /GWR_DEBUG_BROWSER=native-chrome|set GWR_DEBUG_BROWSER=native-chrome/i);
});

test('ci workflow should run extension smoke validation as an explicit step', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');

  assert.match(workflow, /name:\s+Extension smoke/i);
  assert.match(workflow, /run:\s+pnpm test:extension-smoke/i);
});

test('README_zh should explain how to load the unpacked Chrome extension build', async () => {
  const readme = await readFile(new URL('../../README_zh.md', import.meta.url), 'utf8');

  assert.match(readme, /Chrome 插件/i);
  assert.match(readme, /dist\/extension/);
  assert.match(readme, /加载已解压缩的扩展程序|Load unpacked/i);
  assert.match(readme, /pnpm debug:auto/);
  assert.match(readme, /pnpm debug:manual/);
});
