type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

class Logger {
  private level: LogLevel = 'info';

  constructor(private ctx: string) {}

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  debug(msg: string, meta?: Record<string, unknown>): void {
    this.log('debug', msg, meta);
  }

  info(msg: string, meta?: Record<string, unknown>): void {
    this.log('info', msg, meta);
  }

  warn(msg: string, meta?: Record<string, unknown>): void {
    this.log('warn', msg, meta);
  }

  error(msg: string, meta?: Record<string, unknown>): void {
    this.log('error', msg, meta);
  }

  private log(lvl: LogLevel, msg: string, meta?: Record<string, unknown>): void {
    if (LEVELS[lvl] < LEVELS[this.level]) return;
    const ts = new Date().toISOString();
    const prefix = `[${ts}] [${lvl.toUpperCase()}] [${this.ctx}]`;
    const extra = meta ? ` ${JSON.stringify(meta)}` : '';
    console.log(`${prefix} ${msg}${extra}`);
  }
}

export function createLogger(ctx: string): Logger {
  return new Logger(ctx);
}
