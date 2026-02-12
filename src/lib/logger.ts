const isDev = process.env.NODE_ENV === 'development';

export const log = {
  debug: (...args: unknown[]) => { if (isDev) console.log('[DEBUG]', ...args); },
  info: (...args: unknown[]) => { if (isDev) console.info('[INFO]', ...args); },
  warn: (...args: unknown[]) => console.warn('[WARN]', ...args),
  error: (...args: unknown[]) => console.error('[ERROR]', ...args),
};
