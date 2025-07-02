#!/usr/bin/env node

import chalk from 'chalk';
import { Command } from 'commander';
import { createExampleCommand } from './commands/example.js';
import { startServer } from './server.js';
import { SlackServer } from './slack-server.js';

// // Read package.json for version
// const packageJsonPath = join(__dirname, '..', '..', 'package.json');
// const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

const version = '0.0.1';

const program = new Command();

program.name('code-bridge').description('Code Bridge Server').version(version);

program
  .command('start')
  .description('Start both the Fastify server and Slack socket mode server')
  .option('-p, --port <port>', 'Port for the Fastify server', '3000')
  .option('-h, --host <host>', 'Host for the Fastify server', 'localhost')
  .action(async (options) => {
    try {
      const port = parseInt(options.port, 10);
      const host = options.host;

      console.log(chalk.green('Starting Code Bridge servers...'));

      const slackServer = new SlackServer();

      // Handle graceful shutdown
      const shutdown = async (): Promise<void> => {
        console.log(chalk.yellow('\nShutting down servers...'));
        await slackServer.stop();
        console.log(chalk.gray('Servers stopped'));
        process.exit(0);
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);

      // Start both servers concurrently
      await Promise.all([
        // Start Fastify server
        (async () => {
          console.log(chalk.blue(`Starting Fastify server on ${host}:${port}...`));
          await startServer({ port, host });
          console.log(chalk.green(`✓ Fastify server started on ${host}:${port}`));
        })(),

        // Start Slack server
        (async () => {
          console.log(chalk.blue('Starting Slack socket mode server...'));
          await slackServer.start();
          console.log(chalk.green('✓ Slack socket mode server started'));
        })(),
      ]);

      console.log(chalk.green('🚀 All servers are running!'));
      console.log(chalk.gray('Press Ctrl+C to stop all servers'));

      // Keep the process running
      process.stdin.resume();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(chalk.red('Failed to start servers:'), errorMessage);
      process.exit(1);
    }
  });

program
  .command('version')
  .description('Show status information')
  .action(() => {
    console.log(chalk.gray(`Version: ${version}`));
    console.log(chalk.gray(`Node: ${process.version}`));
  });

// Add the example command
program.addCommand(createExampleCommand());

program.parse();
