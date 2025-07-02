#!/usr/bin/env node

import chalk from 'chalk';
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createExampleCommand } from './commands/example.js';
import { SlackServer } from './slack-server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read package.json for version
const packageJsonPath = join(__dirname, '..', '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

const program = new Command();

program.name('code-bridge').description('Code Bridge Server').version(packageJson.version);

program
  .command('start')
  .description('Start the Slack socket mode server')
  .action(async () => {
    try {
      console.log(chalk.green('Starting Slack socket mode server...'));
      
      const slackServer = new SlackServer();

      // Handle graceful shutdown
      const shutdown = async (): Promise<void> => {
        console.log(chalk.yellow('\nShutting down server...'));
        await slackServer.stop();
        process.exit(0);
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);

      await slackServer.start();
      console.log(chalk.green('✓ Slack socket mode server started'));
      console.log(chalk.gray('Press Ctrl+C to stop the server'));
      
      // Keep the process running
      process.stdin.resume();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(chalk.red('Failed to start server:'), errorMessage);
      process.exit(1);
    }
  });

program
  .command('version')
  .description('Show status information')
  .action(() => {
    console.log(chalk.gray(`Version: ${packageJson.version}`));
    console.log(chalk.gray(`Node: ${process.version}`));
  });

// Add the example command
program.addCommand(createExampleCommand());

program.parse();
