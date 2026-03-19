import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('build should bundle extension page hook, content script, background worker, and popup', () => {
  const buildScript = readFileSync(new URL('../../build.js', import.meta.url), 'utf8');

  assert.match(buildScript, /entryPoints:\s*\['src\/extension\/pageHook\.js'\]/);
  assert.match(buildScript, /outfile:\s*'dist\/extension\/page-hook\.js'/);
  assert.match(buildScript, /entryPoints:\s*\['src\/extension\/contentScript\.js'\]/);
  assert.match(buildScript, /outfile:\s*'dist\/extension\/content-script\.js'/);
  assert.match(buildScript, /entryPoints:\s*\['src\/extension\/background\.js'\]/);
  assert.match(buildScript, /outfile:\s*'dist\/extension\/background\.js'/);
  assert.match(buildScript, /entryPoints:\s*\['src\/extension\/popup\.js'\]/);
  assert.match(buildScript, /outfile:\s*'dist\/extension\/popup\.js'/);
});
