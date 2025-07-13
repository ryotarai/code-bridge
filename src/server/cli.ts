#!/usr/bin/env node

import { Firestore } from '@google-cloud/firestore';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { WebClient } from '@slack/web-api';
import { Command } from 'commander';
import { ConfigLoader } from './config.js';
import { FirestoreDatabase } from './database/firestore.js';
import { GitHub } from './github.js';
import { KubernetesInfra } from './infra/kubernetes.js';
import { logger } from './logger.js';
import { SecretManager } from './secretmanager.js';
import { startServer } from './server.js';
import { SlackServer } from './slack-server.js';
import { createStorage } from './storage/storage.js';

const version = '0.0.1';

const program = new Command();

program.name('code-bridge').description('Code Bridge Server').version(version);

program
  .command('start')
  .description('Start both the Fastify server and Slack socket mode server')
  .option('-c, --config <path>', 'Path to configuration file (JSON)')
  .action(async (options) => {
    try {
      logger.info('Starting Code Bridge server...');

      // Load configuration
      const secretManager = new SecretManager(new SecretManagerServiceClient());
      const configLoader = new ConfigLoader(secretManager);
      const config = await configLoader.loadConfigFromFile(options.config || 'config.yaml');

      logger.info('Starting Code Bridge servers...');
      logger.info(
        `Configuration loaded${options.config ? ` from ${options.config}` : ' from environment variables'}`
      );

      const firestore = new Firestore({
        projectId: config.database.firestore.projectId,
        databaseId: config.database.firestore.databaseId,
      });

      const github = config.github ? new GitHub(config.github) : undefined;
      const slackClient = new WebClient(config.slack.botToken);
      const storage = createStorage(config.storage);
      const database = new FirestoreDatabase(firestore);

      const infra = new KubernetesInfra(config.runner, database, storage);
      const slackServer = new SlackServer({
        infra,
        socketToken: config.slack.appToken,
        botToken: config.slack.botToken,
        database,
        github,
      });

      // Handle graceful shutdown
      const shutdown = async (): Promise<void> => {
        logger.info('Shutting down servers...');
        await slackServer.stop();
        logger.info('Servers stopped');
        process.exit(0);
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);

      // Start both servers concurrently
      await Promise.all([
        // Start Fastify server
        (async (): Promise<void> => {
          logger.info(`Starting Fastify server on ${config.server.host}:${config.server.port}...`);
          await startServer({
            port: config.server.port,
            host: config.server.host,
            slackClient,
            database,
          });
          logger.info(`✓ Fastify server started on ${config.server.host}:${config.server.port}`);
        })(),

        // Start Slack server
        (async (): Promise<void> => {
          logger.info('Starting Slack socket mode server...');
          await slackServer.start();
          logger.info('✓ Slack socket mode server started');
        })(),
      ]);

      logger.info('🚀 All servers are running!');
      logger.info('Press Ctrl+C to stop all servers');

      // Keep the process running
      process.stdin.resume();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to start servers: %s', errorMessage);
      if (error instanceof Error && error.message.includes('Configuration validation failed')) {
        logger.error('💡 Tip: Check your configuration file or environment variables');
        logger.error('💡 Use config.example.json as a reference');
      }
      process.exit(1);
    }
  });

program
  .command('version')
  .description('Show status information')
  .action(() => {
    logger.info(`Version: ${version}`);
    logger.info(`Node: ${process.version}`);
  });

program.parse();
