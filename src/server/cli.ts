#!/usr/bin/env node

import { WebClient } from '@slack/web-api';
import chalk from 'chalk';
import { Command } from 'commander';
import { createExampleCommand } from './commands/example.js';
import { loadConfigFromFile } from './config.js';
import { KubernetesInfra } from './infra/kubernetes.js';
import { createKvs } from './kvs/kvs.js';
import { startServer } from './server.js';
import { SessionManager } from './sessions.js';
import { SlackServer } from './slack-server.js';

const version = '0.0.1';

const program = new Command();

program.name('code-bridge').description('Code Bridge Server').version(version);

program
  .command('start')
  .description('Start both the Fastify server and Slack socket mode server')
  .option('-c, --config <path>', 'Path to configuration file (JSON)')
  .action(async (options) => {
    try {
      // Load configuration
      const config = loadConfigFromFile(options.config || 'config.yaml');

      console.log(chalk.green('Starting Code Bridge servers...'));
      console.log(
        chalk.gray(
          `Configuration loaded${options.config ? ` from ${options.config}` : ' from environment variables'}`
        )
      );

      const slackClient = new WebClient(config.slack.botToken);
      const kvs = createKvs(config.kvs);
      const sessionManager = new SessionManager(kvs);

      const infra = new KubernetesInfra(config.kubernetes);
      const slackServer = new SlackServer({
        infra,
        socketToken: config.slack.appToken,
        botToken: config.slack.botToken,
        sessionManager,
      });

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
        (async (): Promise<void> => {
          console.log(
            chalk.blue(`Starting Fastify server on ${config.server.host}:${config.server.port}...`)
          );
          await startServer({
            port: config.server.port,
            host: config.server.host,
            slackClient,
            sessionManager,
          });
          console.log(
            chalk.green(`✓ Fastify server started on ${config.server.host}:${config.server.port}`)
          );
        })(),

        // Start Slack server
        (async (): Promise<void> => {
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
      if (error instanceof Error && error.message.includes('Configuration validation failed')) {
        console.error(
          chalk.yellow('💡 Tip: Check your configuration file or environment variables')
        );
        console.error(chalk.yellow('💡 Use config.example.json as a reference'));
      }
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
