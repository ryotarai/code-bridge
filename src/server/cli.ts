#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createExampleCommand } from './commands/example.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read package.json for version
const packageJsonPath = join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

const program = new Command();

program
  .name('code-bridge')
  .description('A modern CLI tool')
  .version(packageJson.version);

program
  .command('hello')
  .description('Say hello')
  .option('-n, --name <name>', 'name to greet', 'World')
  .action((options) => {
    console.log(chalk.green(`Hello, ${options.name}!`));
  });

program
  .command('status')
  .description('Show status information')
  .action(() => {
    console.log(chalk.blue('🚀 CLI is working!'));
    console.log(chalk.gray(`Version: ${packageJson.version}`));
    console.log(chalk.gray(`Node: ${process.version}`));
  });

// Add the example command
program.addCommand(createExampleCommand());

program.parse();