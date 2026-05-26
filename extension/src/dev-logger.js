function isUnpackedExtension() {
  try {
    const manifest = chrome?.runtime?.getManifest?.();
    return !!manifest && !manifest.update_url;
  } catch {
    return false;
  }
}

function isLocalApiBase() {
  try {
    return String(globalThis.API_BASE || '').includes('localhost');
  } catch {
    return false;
  }
}

export function isDevLoggingEnabled() {
  return Boolean(globalThis.CLIPMARK_DEV_LOG === true || isLocalApiBase() || isUnpackedExtension());
}

export function createDevLogger(scope) {
  const enabled = isDevLoggingEnabled();
  const prefix = `[${scope}]`;

  function print(level, message, data) {
    if (!enabled && level === 'debug') return;
    const stamp = new Date().toISOString();
    const text = `${prefix}[${level.toUpperCase()}][${stamp}] ${message}`;
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    if (data === undefined) fn(text);
    else fn(text, data);
  }

  return {
    enabled,
    debug(message, data) { print('debug', message, data); },
    info(message, data) { print('info', message, data); },
    warn(message, data) { print('warn', message, data); },
    error(message, data) { print('error', message, data); },
  };
}

export function installGlobalErrorLogging(scope) {
  const logger = createDevLogger(scope);

  globalThis.addEventListener('error', (event) => {
    logger.error('Unhandled error', {
      message: event?.message,
      source: event?.filename,
      line: event?.lineno,
      column: event?.colno,
    });
  });

  globalThis.addEventListener('unhandledrejection', (event) => {
    logger.error('Unhandled promise rejection', event?.reason);
  });
}
