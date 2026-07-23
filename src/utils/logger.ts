import chalk from 'chalk';

export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'verbose' | 'debug';

const LEVELS: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  verbose: 4,
  debug: 5,
};

export interface Logger {
  debug: (message: string, ...args: unknown[]) => void;
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
  verbose: (message: string, ...args: unknown[]) => void;
}

function shouldLog(current: LogLevel, target: LogLevel): boolean {
  return LEVELS[current] >= LEVELS[target];
}

export function createLogger(level: LogLevel = 'info'): Logger {
  const print = (target: LogLevel, color: (s: string) => string, prefix: string) => {
    return (message: string, ...args: unknown[]) => {
      if (!shouldLog(level, target)) return;
      const parts = [color(prefix), message];
      if (args.length > 0 && target === 'verbose') {
        parts.push('\n', JSON.stringify(args, null, 2));
      }
      console.log(parts.join(' '));
    };
  };

  return {
    debug: print('debug', chalk.gray, '[debug]'),
    info: print('info', chalk.cyan, '[info]'),
    warn: print('warn', chalk.yellow, '[warn]'),
    error: print('error', chalk.red, '[error]'),
    verbose: print('verbose', chalk.magenta, '[verbose]'),
  };
}
