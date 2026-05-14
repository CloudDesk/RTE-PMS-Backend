const { spawnSync } = require('child_process');
const { existsSync, mkdirSync } = require('fs');
const path = require('path');

const cacheDir = path.join(process.cwd(), 'node_modules', '.puppeteer_cache');
const configuredExecutable = process.env.PUPPETEER_EXECUTABLE_PATH;
const skipDownloadEnv =
  process.env.PUPPETEER_SKIP_DOWNLOAD || process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD || '';
const shouldSkipDownload = ['1', 'true', 'yes'].includes(skipDownloadEnv.toLowerCase());

process.env.PUPPETEER_CACHE_DIR = process.env.PUPPETEER_CACHE_DIR || cacheDir;

if (shouldSkipDownload) {
  console.log('[puppeteer] Skipping browser install because download is disabled.');
  process.exit(0);
}

if (configuredExecutable && existsSync(configuredExecutable)) {
  console.log(`[puppeteer] Using system browser at ${configuredExecutable}; skipping browser download.`);
  process.exit(0);
}

if (configuredExecutable) {
  console.warn(`[puppeteer] Configured executable not found at ${configuredExecutable}; installing managed browser instead.`);
}

mkdirSync(cacheDir, { recursive: true });

let cliPath;
try {
  cliPath = require.resolve('puppeteer/lib/cjs/puppeteer/node/cli.js');
} catch (error) {
  console.error('[puppeteer] Could not resolve Puppeteer CLI for browser installation.', error);
  process.exit(1);
}

const result = spawnSync(process.execPath, [cliPath, 'browsers', 'install'], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});

if (result.status !== 0) {
  process.exit(result.status || 1);
}
