import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  mkdir,
  readdir,
  rm,
  stat,
  writeFile
} from 'node:fs/promises';

const execFileAsync = promisify(execFile);
const BUILD_LOCK_DIR = '.artifacts/extension-test-build.lock';
const BUILD_MARKER_FILE = '.artifacts/extension-test-build.marker';
const BUILD_INPUTS = [
  'build.js',
  'public',
  'src/core',
  'src/extension',
  'src/sdk',
  'src/userscript/urlUtils.js'
];

async function getPathMtimeMs(targetPath) {
  const info = await stat(targetPath);
  if (!info.isDirectory()) {
    return info.mtimeMs;
  }

  const entries = await readdir(targetPath, { withFileTypes: true });
  let latest = info.mtimeMs;
  for (const entry of entries) {
    const nextPath = path.join(targetPath, entry.name);
    const nextMtime = await getPathMtimeMs(nextPath);
    if (nextMtime > latest) {
      latest = nextMtime;
    }
  }
  return latest;
}

async function getLatestInputMtimeMs(rootDir) {
  let latest = 0;
  for (const relativePath of BUILD_INPUTS) {
    const nextMtime = await getPathMtimeMs(path.resolve(rootDir, relativePath));
    if (nextMtime > latest) {
      latest = nextMtime;
    }
  }
  return latest;
}

async function isBuildFresh(rootDir) {
  try {
    const markerPath = path.resolve(rootDir, BUILD_MARKER_FILE);
    const distScriptPath = path.resolve(rootDir, 'dist/extension/content-script.js');
    const markerInfo = await stat(markerPath);
    const distInfo = await stat(distScriptPath);
    const latestInputMtimeMs = await getLatestInputMtimeMs(rootDir);
    const builtAt = Math.min(markerInfo.mtimeMs, distInfo.mtimeMs);
    return builtAt >= latestInputMtimeMs;
  } catch {
    return false;
  }
}

async function acquireBuildLock(rootDir) {
  const lockPath = path.resolve(rootDir, BUILD_LOCK_DIR);
  while (true) {
    try {
      await mkdir(lockPath, { recursive: false });
      return lockPath;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      if (await isBuildFresh(rootDir)) return null;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}

export async function ensureProductionBuild(rootDir) {
  if (await isBuildFresh(rootDir)) return;

  await mkdir(path.resolve(rootDir, '.artifacts'), { recursive: true });
  const lockPath = await acquireBuildLock(rootDir);
  if (lockPath === null) return;

  try {
    if (!(await isBuildFresh(rootDir))) {
      await execFileAsync('node', ['build.js', '--prod'], { cwd: rootDir });
      await writeFile(path.resolve(rootDir, BUILD_MARKER_FILE), `${new Date().toISOString()}\n`);
    }
  } finally {
    await rm(lockPath, { recursive: true, force: true });
  }
}
