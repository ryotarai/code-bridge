import type { App as AppType, SayFn } from '@slack/bolt';
import bolt from '@slack/bolt';
import { AppMentionEvent } from '@slack/types';
import dotenv from 'dotenv';
import { logger } from './index.js';
import { Infra } from './infra/infra.js';
import { SessionManager } from './sessions.js';

const { App } = bolt;

// Load environment variables
dotenv.config();

export interface SlackServerOptions {
  infra: Infra;
  socketToken: string;
  botToken: string;
  sessionManager: SessionManager;
}

export class SlackServer {
  private app: AppType;
  private isRunning = false;
  private infra: Infra;
  private sessionManager: SessionManager;

  constructor(options: SlackServerOptions) {
    // Initialize Bolt app
    this.app = new App({
      token: options.botToken,
      appToken: options.socketToken,
      socketMode: true,
    });

    // Setup event handlers
    this.setupEventHandlers();

    this.infra = options.infra;
    this.sessionManager = options.sessionManager;
  }

  private setupEventHandlers(): void {
    // Handle app mentions only
    this.app.event('app_mention', async ({ event }: { event: AppMentionEvent; say: SayFn }) => {
      try {
        logger(`App mentioned: ${event.text} from user ${event.user} in channel ${event.channel}`);

        const session = await this.sessionManager.createSessionFromSlackThread({
          channelId: event.channel,
          threadTs: event.thread_ts ?? event.ts,
        });

        await this.infra.start({
          initialInput: event.text,
          sessionId: session.id,
          sessionKey: session.key,
        });
      } catch (error) {
        logger(`Error handling app mention: ${error}`);
      }
    });

    [
      {
        actionId: 'approve_tool',
        approve: true,
      },
      {
        actionId: 'deny_tool',
        approve: false,
      },
    ].forEach(({ actionId, approve }) => {
      this.app.action(actionId, async ({ ack, action }) => {
        if (action.type === 'button') {
          if (!action.value) {
            throw new Error('No value found in action');
          }
          const actionValue = JSON.parse(action.value);
          const session = await this.sessionManager.getSession(
            actionValue.sessionId,
            actionValue.sessionKey
          );
          if (!session.pod) {
            throw new Error('Pod not found');
          }
          await this.infra.approveOrDenyTool({
            namespace: session.pod.namespace,
            name: session.pod.name,
            requestId: actionValue.requestId,
            approve,
          });
          await ack();
        }
      });
    });
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
