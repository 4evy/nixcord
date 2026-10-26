import type { Logger } from '@nixcord/domain';
import consola from 'consola';

export const createLogger = (verbose = false): Logger => {
  const level = verbose ? 4 : 3;
  const instance = consola.create({
    level,
    defaults: {
      tag: 'generate-plugin-options',
    },
  });

  return {
    info: (message) => instance.info(message),
    warn: (message) => instance.warn(message),
    error: (message, ...args) => instance.error(message, ...args),
    success: (message) => instance.success(message),
    debug: verbose ? (message) => instance.debug(message) : () => {},
  };
};
