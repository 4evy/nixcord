// @ts-check
// Discord's embedded Electron loads this directly, so use plain CommonJS
// without requiring runtime TypeScript support or a compilation step
// These native modules append /cache to the path supplied by desktop core
// Their installation directory is in the store, so keep data in the profile
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');

/**
 * @param {{ setDataPath: (directory: string) => unknown }} native
 * @param {string} name
 */
module.exports = (native, name) => {
  const setDataPath = native.setDataPath;
  if (typeof setDataPath !== 'function') {
    throw new Error(`Review changed ${name} data-path API`);
  }
  native.setDataPath = () => {
    const directory = join(require('electron').app.getPath('userData'), 'native_module_data', name);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    return setDataPath.call(native, directory);
  };
};
