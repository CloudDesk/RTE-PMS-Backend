const { spawnSync } = require('child_process');

const skipBrowserDownload =
  process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD === 'true' ||
  process.env.PUPPETEER_SKIP_DOWNLOAD === 'true';

if (skipBrowserDownload) {
  console.log('Skipping Puppeteer browser install because download is disabled.');
  process.exit(0);
}

const result = spawnSync(
  process.execPath,
  [
    require.resolve('puppeteer/lib/cjs/puppeteer/node/cli.js'),
    'browsers',
    'install',
    'chrome',
  ],
  {
    stdio: 'inherit',
    env: process.env,
  },
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
