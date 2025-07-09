export { default as chalk } from 'chalk';
export { Command } from 'commander';
import chalk from 'chalk';
import { logger as pinoLogger } from './logger.js';

// Example utility functions
export function logger(message: string, level: 'info' | 'error' | 'warn' = 'info'): void {
  const colors = {
    info: chalk.blue,
    error: chalk.red,
    warn: chalk.yellow,
  };

  pinoLogger.info(colors[level](`[${level.toUpperCase()}] ${message}`));
}

export function formatDate(date: Date = new Date()): string {
  return date.toISOString().split('T')[0];
}
