import type { SayFn } from '@slack/bolt';
import * as Bolt from '@slack/bolt';
import { AppMentionEvent } from '@slack/types';
import dotenv from 'dotenv';
import { logger } from './index.js';

// Load environment variables
dotenv.config();

export interface SlackServerOptions {
  socketToken?: string;
  botToken?: string;
  signingSecret?: string;
}

export class SlackServer {
  private app: Bolt.App;
  private isRunning = false;

  constructor(options: SlackServerOptions = {}) {
    const socketToken = options.socketToken || process.env.SLACK_APP_TOKEN;
    const botToken = options.botToken || process.env.SLACK_BOT_TOKEN;

    if (!socketToken) {
      throw new Error('SLACK_APP_TOKEN is required for Socket Mode');
    }

    if (!botToken) {
      throw new Error('SLACK_BOT_TOKEN is required');
    }

    // Initialize Bolt app
    this.app = new Bolt.App({
      token: botToken,
      appToken: socketToken,
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
