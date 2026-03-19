import { mkdirSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import readline from 'node:readline';

import { chromium } from 'playwright';
import {
  getPnpmCommandSpec,
  resolveDebugBrowserFlavor,
  parseDebugCliArgs,
  resolveDebugBrowserChannel,
  resolveDebugProxySettings
} from './debug-extension-utils.js';

const ROOT_DIR = process.cwd();
const EXTENSION_DIR = resolve(ROOT_DIR, 'dist/extension');
const DEBUG_ROOT = resolve(ROOT_DIR, '.chrome-debug');
const USER_DATA_DIR = process.env.GWR_DEBUG_USER_DATA_DIR
  ? resolve(ROOT_DIR, process.env.GWR_DEBUG_USER_DATA_DIR)
  : join(DEBUG_ROOT, 'profile');
const NATIVE_USER_DATA_DIR = process.env.GWR_DEBUG_NATIVE_USER_DATA_DIR
  ? resolve(ROOT_DIR, process.env.GWR_DEBUG_NATIVE_USER_DATA_DIR)
  : join(DEBUG_ROOT, 'chrome-native-profile');
const SCREENSHOT_DIR = join(DEBUG_ROOT, 'screenshots');
const DEBUG_STATE_PATH = join(DEBUG_ROOT, 'last-debug-state.json');
const DEBUG_URL = process.env.GWR_DEBUG_URL || 'https://gemini.google.com/app';
const DEBUG_PORT = Number.parseInt(process.env.GWR_DEBUG_PORT || '9223', 10);

function runBuild() {
  const spec = getPnpmCommandSpec(process.platform, ['build']);
  execFileSync(spec.command, spec.args, {
    cwd: ROOT_DIR,
    stdio: 'inherit'
  });
}

function ensureDebugDirs() {
  mkdirSync(DEBUG_ROOT, { recursive: true });
  mkdirSync(USER_DATA_DIR, { recursive: true });
  mkdirSync(NATIVE_USER_DATA_DIR, { recursive: true });
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function formatConsoleValue(value) {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

async function getExtensionId(context) {
  const workers = context.serviceWorkers();
  const worker = workers[0] || await context.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => null);
  if (!worker) return '';
  const match = worker.url().match(/^chrome-extension:\/\/([^/]+)\//);
  return match?.[1] || '';
}

function attachPageLogging(page) {
  if (page.__gwrDebugAttached) return;
  page.__gwrDebugAttached = true;

  page.on('console', async (message) => {
    const values = [];
    for (const arg of message.args()) {
      try {
        values.push(await arg.jsonValue());
      } catch {
        values.push(await arg.evaluate((v) => String(v)).catch(() => '[unserializable]'));
      }
    }
    const rendered = values.length > 0 ? values.map(formatConsoleValue).join(' ') : message.text();
    console.log(`[console:${message.type()}] ${page.url()} ${rendered}`);
  });

  page.on('pageerror', (error) => {
    console.log(`[pageerror] ${page.url()} ${error.stack || error.message}`);
  });

  page.on('response', (response) => {
    const url = response.url();
    if (!/googleusercontent|lh3\.google\.com|gemini\.google\.com/i.test(url)) return;
    if (response.status() < 300) return;
    console.log(`[response:${response.status()}] ${url}`);
  });
}

function getAppPages(context) {
  return context.pages().filter((page) => !page.url().startsWith('chrome-extension://'));
}

async function ensureAppPage(context, preferredUrl = DEBUG_URL) {
  const existing = getAppPages(context)[0];
  const page = existing || await context.newPage();
  attachPageLogging(page);
  if (!page.url() || page.url() === 'about:blank') {
    try {
      await page.goto(preferredUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    } catch (error) {
      console.warn(`[debug-script] 初始打开失败，保留浏览器会话供手动处理: ${error.message}`);
    }
  }
  return page;
}

async function requestDebugState(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const requestId = `gwr-debug-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error('Timed out waiting for gwr:debug-response'));
    }, 5000);

    function onMessage(event) {
      if (event.source !== window) return;
      if (event.data?.type !== 'gwr:debug-response') return;
      if (event.data?.requestId !== requestId) return;
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      resolve(event.data.payload);
    }

    window.addEventListener('message', onMessage);
    window.postMessage({ type: 'gwr:debug-request', requestId }, '*');
  }));
}

function serializeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack || ''
    };
  }

  return {
    message: String(error || 'Unknown error')
  };
}

async function collectPageDiagnostics(page) {
  const diagnostics = await page.evaluate(() => ({
    href: window.location.href,
    title: document.title,
    readyState: document.readyState,
    imageCount: document.querySelectorAll('img,canvas').length,
    controlCount: document.querySelectorAll('.gwr-extension-controls').length,
    contentScriptState: document.documentElement?.dataset?.gwrContentScriptState || '',
    contentScriptError: document.documentElement?.dataset?.gwrContentScriptError || '',
    debugBridge: document.documentElement?.dataset?.gwrDebugBridge || '',
    debugTotal: document.documentElement?.dataset?.gwrDebugTotal || '',
    debugReady: document.documentElement?.dataset?.gwrDebugReady || '',
    debugUpdatedAt: document.documentElement?.dataset?.gwrDebugUpdatedAt || '',
    bodyPresent: Boolean(document.body)
  }));

  return {
    ...diagnostics,
    capturedAt: new Date().toISOString()
  };
}

async function waitForDebugBridge(page, timeoutMs = 15000) {
  await page.waitForLoadState('domcontentloaded', { timeout: 45000 }).catch(() => {});
  await page.waitForFunction(
    () => {
      const root = document.documentElement;
      return root?.dataset?.gwrDebugBridge === 'ready'
        || document.querySelector('.gwr-extension-controls')
        || document.querySelector('img,canvas');
    },
    { timeout: timeoutMs }
  ).catch(() => {});
}

async function dumpDebugStateToFile(page) {
  const pageDiagnostics = await collectPageDiagnostics(page).catch((error) => ({
    capturedAt: new Date().toISOString(),
    error: serializeError(error)
  }));

  try {
    const state = await requestDebugState(page);
    const payload = {
      ok: true,
      requestedAt: new Date().toISOString(),
      page: pageDiagnostics,
      state
    };
    writeFileSync(DEBUG_STATE_PATH, `${JSON.stringify(payload, null, 2)}\n`);
    return payload;
  } catch (error) {
    const payload = {
      ok: false,
      requestedAt: new Date().toISOString(),
      page: pageDiagnostics,
      error: serializeError(error)
    };
    writeFileSync(DEBUG_STATE_PATH, `${JSON.stringify(payload, null, 2)}\n`);
    return payload;
  }
}

async function launchDebugBrowser(preferredUrl = DEBUG_URL) {
  const browserFlavor = resolveDebugBrowserFlavor(process.env);
  if (browserFlavor === 'native-chrome') {
    return launchNativeChromeBrowser(preferredUrl);
  }

  ensureDebugDirs();
  const proxy = resolveDebugProxySettings(process.env);
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    channel: resolveDebugBrowserChannel(process.env),
    executablePath: process.env.GWR_DEBUG_EXECUTABLE_PATH || undefined,
    proxy,
    args: [
      `--disable-extensions-except=${EXTENSION_DIR}`,
      `--load-extension=${EXTENSION_DIR}`
    ],
    viewport: null
  });

  for (const page of context.pages()) {
    attachPageLogging(page);
  }
  context.on('page', attachPageLogging);

  const page = await ensureAppPage(context, preferredUrl);
  const extensionId = await getExtensionId(context);
  return {
    backend: 'playwright',
    context,
    page,
    extensionId,
    async close() {
      await context.close().catch(() => {});
    }
  };
}

function resolveChromeExecutablePath(env = process.env) {
  if (env.GWR_DEBUG_EXECUTABLE_PATH) {
    return env.GWR_DEBUG_EXECUTABLE_PATH;
  }

  const candidates = process.platform === 'win32'
    ? [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')
      ]
    : [];

  return candidates.find((candidate) => candidate && existsSync(candidate)) || '';
}

async function waitForCdpReady(port, timeoutMs = 15000) {
  const endpoint = `http://127.0.0.1:${port}/json/version`;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(endpoint);
      if (response.ok) {
        return endpoint;
      }
    } catch {}
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 300));
  }

  throw new Error(`Timed out waiting for Chrome DevTools endpoint on port ${port}`);
}

async function launchNativeChromeBrowser(preferredUrl = DEBUG_URL) {
  ensureDebugDirs();
  const executablePath = resolveChromeExecutablePath(process.env);
  if (!executablePath) {
    throw new Error('未找到可用的 Chrome 可执行文件，请设置 GWR_DEBUG_EXECUTABLE_PATH');
  }

  const proxy = resolveDebugProxySettings(process.env);
  const args = [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${NATIVE_USER_DATA_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-popup-blocking',
    `--disable-extensions-except=${EXTENSION_DIR}`,
    `--load-extension=${EXTENSION_DIR}`,
    preferredUrl
  ];

  if (proxy?.server) {
    args.push(`--proxy-server=${proxy.server}`);
  }
  if (proxy?.bypass) {
    args.push(`--proxy-bypass-list=${proxy.bypass}`);
  }

  const chromeProcess = spawn(executablePath, args, {
    cwd: ROOT_DIR,
    stdio: 'ignore',
    windowsHide: false
  });

  const endpoint = await waitForCdpReady(DEBUG_PORT);
  const browser = await chromium.connectOverCDP(endpoint);
  const context = browser.contexts()[0];
  if (!context) {
    throw new Error('Connected to Chrome DevTools but no browser context is available');
  }

  for (const page of context.pages()) {
    attachPageLogging(page);
  }
  context.on('page', attachPageLogging);

  const page = await ensureAppPage(context, preferredUrl);
  const extensionId = await getExtensionId(context);
  return {
    backend: 'native-chrome',
    browser,
    context,
    page,
    extensionId,
    chromeProcess,
    async close() {
      await browser.close().catch(() => {});
      if (!chromeProcess.killed) {
        chromeProcess.kill();
      }
    }
  };
}

async function runOneShotMode(mode, preferredUrl) {
  const session = await launchDebugBrowser(preferredUrl);
  try {
    session.page = await ensureAppPage(session.context, preferredUrl);

      if (mode === 'refresh') {
        await session.page.reload({ waitUntil: 'domcontentloaded' });
        console.log(`已刷新: ${session.page.url()}`);
        return;
    }

    if (mode === 'open') {
      await session.page.goto(preferredUrl, { waitUntil: 'domcontentloaded' });
      const diagnostics = await collectPageDiagnostics(session.page);
      console.log(`已打开: ${session.page.url()}`);
      console.log(JSON.stringify(diagnostics, null, 2));
      return;
    }

    if (mode === 'screenshot') {
      const outputPath = join(SCREENSHOT_DIR, `${nowStamp()}.png`);
      await session.page.screenshot({ path: outputPath, fullPage: true });
      console.log(`已保存截图: ${outputPath}`);
      return;
    }

    await waitForDebugBridge(session.page);
    const payload = await dumpDebugStateToFile(session.page);
    console.log(`已写入调试状态: ${DEBUG_STATE_PATH}`);
    if (payload.ok) {
      console.log(`records=${payload.state?.records?.length || 0}, logs=${payload.state?.logs?.length || 0}`);
    } else {
      console.log(`[debug-script] 调试状态导出失败: ${payload.error?.message || 'Unknown error'}`);
    }
  } finally {
    await session.close();
  }
}

async function main() {
  const cli = parseDebugCliArgs(process.argv.slice(2));
  const browserFlavor = resolveDebugBrowserFlavor(process.env);
  const shouldClean = cli.clean;
  if (shouldClean && existsSync(USER_DATA_DIR)) {
    rmSync(USER_DATA_DIR, { recursive: true, force: true });
  }
  if (shouldClean && existsSync(NATIVE_USER_DATA_DIR)) {
    rmSync(NATIVE_USER_DATA_DIR, { recursive: true, force: true });
  }

  runBuild();
  const initialUrl = cli.targetUrl || DEBUG_URL;
  if (cli.mode !== 'interactive') {
    await runOneShotMode(cli.mode, initialUrl);
    return;
  }

  let preferredUrl = DEBUG_URL;
  let session = await launchDebugBrowser(preferredUrl);
  const activeUserDataDir = session.backend === 'native-chrome'
    ? NATIVE_USER_DATA_DIR
    : USER_DATA_DIR;
  console.log(`调试浏览器已启动。扩展目录: ${EXTENSION_DIR}`);
  console.log(`用户数据目录: ${activeUserDataDir}`);
  console.log(`浏览器后端: ${session.backend}`);
  console.log(`代理: ${resolveDebugProxySettings(process.env)?.server || 'disabled'}`);
  if (session.extensionId) {
    console.log(`扩展 ID: ${session.extensionId}`);
    writeFileSync(join(DEBUG_ROOT, 'last-extension-id.txt'), `${session.extensionId}\n`);
  }
  if (browserFlavor === 'native-chrome') {
    console.log('提示: 正式版 Chrome 不再支持命令行自动加载扩展。');
    console.log('请先到 chrome://extensions 手动加载 dist/extension，之后再回到目标页面执行 d / r / s。');
  }
  console.log('命令: h 帮助, r 刷新页面, d 导出调试状态, b 重建并重启浏览器, s 截图, o <url> 打开地址, q 退出');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'gwr-debug> '
  });

  const printHelp = () => {
    console.log('h: 显示帮助');
    console.log('r: 刷新当前页面');
    console.log('d: 拉取扩展调试状态并写入 .chrome-debug/last-debug-state.json');
    console.log('b: 重新构建 dist/extension 并重启专用调试浏览器');
    console.log('s: 保存当前页面截图到 .chrome-debug/screenshots/');
    console.log('o <url>: 打开或跳转到指定 URL');
    console.log('q: 退出');
  };

  rl.prompt();
  rl.on('line', async (line) => {
    const input = line.trim();
    const [command, ...rest] = input.split(/\s+/);
    try {
      if (!command || command === 'h') {
        printHelp();
      } else if (command === 'r') {
        session.page = await ensureAppPage(session.context, preferredUrl);
        await session.page.reload({ waitUntil: 'domcontentloaded' });
        console.log(`已刷新: ${session.page.url()}`);
      } else if (command === 'd') {
        session.page = await ensureAppPage(session.context, preferredUrl);
        await waitForDebugBridge(session.page);
        const payload = await dumpDebugStateToFile(session.page);
        console.log(`已写入调试状态: ${DEBUG_STATE_PATH}`);
        if (payload.ok) {
          console.log(`records=${payload.state?.records?.length || 0}, logs=${payload.state?.logs?.length || 0}`);
        } else {
          console.log(`[debug-script] 调试状态导出失败: ${payload.error?.message || 'Unknown error'}`);
        }
      } else if (command === 'b') {
        preferredUrl = session.page.url() || preferredUrl;
        await session.close();
        runBuild();
        session = await launchDebugBrowser(preferredUrl);
        console.log(`已重启调试浏览器: ${session.page.url()}`);
      } else if (command === 's') {
        session.page = await ensureAppPage(session.context, preferredUrl);
        const outputPath = join(SCREENSHOT_DIR, `${nowStamp()}.png`);
        await session.page.screenshot({ path: outputPath, fullPage: true });
        console.log(`已保存截图: ${outputPath}`);
      } else if (command === 'o') {
        const nextUrl = rest.join(' ') || DEBUG_URL;
        preferredUrl = nextUrl;
        session.page = await ensureAppPage(session.context, preferredUrl);
        await session.page.goto(preferredUrl, { waitUntil: 'domcontentloaded' });
        console.log(`已打开: ${session.page.url()}`);
      } else if (command === 'q') {
        await session.close();
        rl.close();
        return;
      } else {
        console.log(`未知命令: ${command}`);
        printHelp();
      }
    } catch (error) {
      console.error(`[debug-script] ${error.stack || error.message}`);
    }
    rl.prompt();
  });

  rl.on('close', async () => {
    await session.close().catch(() => {});
    process.exit(0);
  });
}

void main();
