export { default as chalk } from 'chalk';
export { Command } from 'commander';
import chalk from 'chalk';

// Example utility functions
export function logger(message: string, level: 'info' | 'error' | 'warn' = 'info'): void {
  const colors = {
    info: chalk.blue,
    error: chalk.red,
    warn: chalk.yellow,
  };

  console.log(colors[level](`[${level.toUpperCase()}] ${message}`));
}

export function formatDate(date: Date = new Date()): string {
  return date.toISOString().split('T')[0];
}
