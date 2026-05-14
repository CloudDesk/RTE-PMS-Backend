const { join } = require('path');

/**
 * Keep the browser cache inside node_modules so cached production installs
 * continue to have access to the downloaded browser binary.
 * @type {import('puppeteer').Configuration}
 */
module.exports = {
  cacheDirectory: join(__dirname, 'node_modules', '.puppeteer_cache'),
};
