const isDev = process.env.NODE_ENV !== 'production';

type LogFn = (...args: unknown[]) => void;

function make(method: 'debug' | 'info' | 'warn' | 'error'): LogFn {
  return (...args: unknown[]) => {
    // Silence debug/info in production, but always emit warn/error so
    // operators see Prisma/Mailgun/session-create failures in prod logs.
    if (!isDev && (method === 'debug' || method === 'info')) return;
    // eslint-disable-next-line no-console
    console[method](...args);
  };
}

export const logger = {
  debug: make('debug'),
  info: make('info'),
  warn: make('warn'),
  error: make('error'),
};
