export function getPnpmCommandSpec(platform, args = []) {
  if (platform === 'win32') {
    return {
      command: 'cmd.exe',
      args: ['/c', 'pnpm', ...args]
    };
  }

  return {
    command: 'pnpm',
    args
  };
}

export function parseDebugCliArgs(argv = []) {
  const args = Array.isArray(argv) ? [...argv] : [];
  let clean = false;
  const positionals = [];

  for (const arg of args) {
    if (arg === '--clean') {
      clean = true;
      continue;
    }
    positionals.push(arg);
  }

  const command = positionals[0] || '';
  const targetUrl = positionals.slice(1).join(' ').trim();
  const supportedModes = new Set(['dump', 'refresh', 'screenshot', 'open']);
  const mode = supportedModes.has(command) ? command : 'interactive';

  return {
    mode,
    targetUrl: mode === 'open' ? targetUrl : '',
    clean
  };
}

export function resolveDebugBrowserChannel(env = {}) {
  const configured = typeof env.GWR_DEBUG_CHANNEL === 'string'
    ? env.GWR_DEBUG_CHANNEL.trim()
    : '';

  return configured || undefined;
}

export function resolveDebugBrowserFlavor(env = {}) {
  const configured = typeof env.GWR_DEBUG_BROWSER === 'string'
    ? env.GWR_DEBUG_BROWSER.trim()
    : '';

  return configured || 'playwright';
}

export function resolveDebugProxySettings(env = {}) {
  const configured = typeof env.GWR_DEBUG_PROXY === 'string'
    ? env.GWR_DEBUG_PROXY.trim()
    : '';

  if (configured.toLowerCase() === 'off' || configured.toLowerCase() === 'none') {
    return undefined;
  }

  const server = configured || 'http://127.0.0.1:7890';
  const bypass = typeof env.GWR_DEBUG_PROXY_BYPASS === 'string' && env.GWR_DEBUG_PROXY_BYPASS.trim()
    ? env.GWR_DEBUG_PROXY_BYPASS.trim()
    : 'localhost;127.0.0.1';

  return {
    server,
    bypass
  };
}
