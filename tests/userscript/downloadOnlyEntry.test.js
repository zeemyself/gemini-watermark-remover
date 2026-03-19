import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('userscript entry should install both download hook and page image replacement', () => {
  const source = readFileSync(new URL('../../src/userscript/index.js', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /MutationObserver/);
  assert.doesNotMatch(source, /querySelectorAll\('img/);
  assert.doesNotMatch(source, /imgElement\.src\s*=\s*''/);
  assert.match(source, /installGeminiDownloadHook/);
  assert.match(source, /installPageImageReplacement/);
});
