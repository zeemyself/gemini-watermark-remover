import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

import { chromium } from 'playwright';

import { isMissingPlaywrightExecutableError } from '../regression/sampleAssetTestUtils.js';
import { ensureProductionBuild } from './testBuildUtils.js';

const ROOT_DIR = process.cwd();
const SAMPLE_IMAGE_PATH = path.resolve(ROOT_DIR, 'src/assets/samples/5.png');
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};

function startStaticServer(rootDir) {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        const rawPath = decodeURIComponent((req.url || '/').split('?')[0]);
        const requestPath = rawPath === '/' ? '/package.json' : rawPath;
        const targetPath = path.resolve(rootDir, `.${requestPath}`);

        if (!targetPath.startsWith(rootDir)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }

        const ext = path.extname(targetPath).toLowerCase();
        const body = await readFile(targetPath);
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(body);
      } catch (error) {
        res.writeHead(404);
        res.end(String(error?.message || error));
      }
    });

    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`
      });
    });
  });
}

test('extension bridge should report successful Gemini fetch interception without injecting controls', async (t) => {
  await ensureProductionBuild(ROOT_DIR);

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    if (isMissingPlaywrightExecutableError(error)) {
      t.skip('Playwright browser binaries are missing in this environment');
      return;
    }
    throw error;
  }

  const sampleImage = await readFile(SAMPLE_IMAGE_PATH);
  const { server, baseUrl } = await startStaticServer(ROOT_DIR);
  const page = await browser.newPage();

  await page.addInitScript(() => {
    const runtimeListeners = [];
    window.__gwrRuntimeListeners = runtimeListeners;
    window.chrome = {
      runtime: {
        onMessage: {
          addListener(listener) {
            runtimeListeners.push(listener);
          }
        }
      }
    };
  });

  await page.route('https://lh3.googleusercontent.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: sampleImage
    });
  });

  try {
    await page.goto(`${baseUrl}/public/extension-fixture.html`);
    await page.addScriptTag({ url: `${baseUrl}/dist/extension/page-hook.js` });
    await page.addScriptTag({ url: `${baseUrl}/dist/extension/content-script.js` });

    await page.waitForFunction(() => document.documentElement?.dataset?.gwrContentScriptState === 'ready');

    const snapshot = await page.evaluate(async () => {
      const response = await fetch('https://lh3.googleusercontent.com/rd-gg/example=s1024');
      const blob = await response.blob();
      const listeners = window.__gwrRuntimeListeners;
      const summary = await new Promise((resolve) => {
        listeners[0]({ type: 'gwr:get-summary' }, null, resolve);
      });
      const debugState = await new Promise((resolve) => {
        listeners[0]({ type: 'gwr:get-debug-state' }, null, resolve);
      });

      return {
        blobType: blob.type,
        blobSize: blob.size,
        controls: document.querySelectorAll('.gwr-extension-controls').length,
        previews: document.querySelectorAll('[data-gwr-preview-image]').length,
        debugBridge: document.documentElement.dataset.gwrDebugBridge || '',
        summary,
        debugState
      };
    });

    assert.equal(snapshot.controls, 0);
    assert.equal(snapshot.previews, 0);
    assert.equal(snapshot.debugBridge, 'ready');
    assert.equal(snapshot.summary.installed, true);
    assert.equal(snapshot.summary.total, 1);
    assert.equal(snapshot.summary.ready, 1);
    assert.equal(snapshot.summary.failed, 0);
    assert.ok(Array.isArray(snapshot.debugState.logs));
    assert.ok(snapshot.debugState.logs.some((entry) => entry?.payload?.summary?.lastPhase === 'success'));
    assert.equal(snapshot.blobType, 'image/png');
    assert.ok(snapshot.blobSize > 0);
  } finally {
    await browser.close();
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});
