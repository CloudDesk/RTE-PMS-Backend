const { join } = require('path');
const { existsSync } = require('fs');

const puppeteerConfig = require('../.puppeteerrc.cjs');
const cacheDirectory = puppeteerConfig?.cacheDirectory || join(__dirname, '..', 'node_modules', '.puppeteer_cache');

async function installPuppeteerBrowser() {
  if (process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD === 'true') {
    console.log('PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true; skipping Puppeteer browser install.');
    return;
  }

  console.log('Installing Puppeteer browser to:', cacheDirectory);

  if (!existsSync(cacheDirectory)) {
    require('fs').mkdirSync(cacheDirectory, { recursive: true });
  }

  try {
    const { install } = require('@puppeteer/browsers');
    await install({
      browser: 'chromium',
      cacheDir: cacheDirectory,
      log: true,
    });
    console.log('Puppeteer browser install completed successfully.');
  } catch (error) {
    console.error('Failed to install Puppeteer browser:', error);
    process.exit(1);
  }
}

installPuppeteerBrowser();
