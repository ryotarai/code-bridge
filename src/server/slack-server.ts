import type { App as AppType, SayFn } from '@slack/bolt';
import bolt from '@slack/bolt';
import { AppMentionEvent } from '@slack/types';
import dotenv from 'dotenv';
import { logger } from './index.js';
import { Infra } from './infra/infra.js';

const { App } = bolt;

// Load environment variables
dotenv.config();

export interface SlackServerOptions {
  infra: Infra;
  socketToken: string;
  botToken: string;
}

export class SlackServer {
  private app: AppType;
  private isRunning = false;

  constructor(options: SlackServerOptions) {
    // Initialize Bolt app
    this.app = new App({
      token: options.botToken,
      appToken: options.socketToken,
      socketMode: true,
    });

    // Setup event handlers
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Handle app mentions only
    this.app.event(
      'app_mention',
      async ({ event, say }: { event: AppMentionEvent; say: SayFn }) => {
        try {
          logger(
            `App mentioned: ${event.text} from user ${event.user} in channel ${event.channel}`
          );

          await say({
            text: `Hello <@${event.user}>! I'm the Code Bridge bot. How can I help you?`,
            thread_ts: event.ts,
          });
        } catch (error) {
          logger(`Error handling app mention: ${error}`);
        }
      }
    );
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      logger('Slack server is already running');
      return;
    }

    try {
      logger('Starting Slack Bolt app in Socket Mode...');
      await this.app.start();
      this.isRunning = true;
      logger('⚡️ Slack Bolt app started successfully');
    } catch (error) {
      logger(`Failed to start Slack server: ${error}`);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) {
      logger('Slack server is not running');
      return;
    }

    try {
      logger('Stopping Slack Bolt app...');
      await this.app.stop();
      this.isRunning = false;
      logger('Slack Bolt app stopped');
    } catch (error) {
      logger(`Failed to stop Slack server: ${error}`);
      throw error;
    }
  }

  public isServerRunning(): boolean {
    return this.isRunning;
  }
}
