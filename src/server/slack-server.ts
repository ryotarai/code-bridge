import type { App as AppType, SlackEventMiddlewareArgs } from '@slack/bolt';
import bolt from '@slack/bolt';
import { MessageElement } from '@slack/web-api/dist/types/response/ConversationsRepliesResponse.js';
import dotenv from 'dotenv';
import { Database } from './database/database.js';
import { GitHub } from './github.js';
import { logger } from './index.js';
import { Infra } from './infra/infra.js';

const { App } = bolt;

// Load environment variables
dotenv.config();

export interface SlackServerOptions {
  infra: Infra;
  socketToken: string;
  botToken: string;
  database: Database;
  github?: GitHub | undefined;
}

export class SlackServer {
  private app: AppType;
  private isRunning = false;
  private infra: Infra;
  private database: Database;
  private github: GitHub | undefined;

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
    this.database = options.database;
    this.github = options.github;
  }

  private setupEventHandlers(): void {
    // Handle app mentions only
    this.app.event('app_mention', async ({ event }: SlackEventMiddlewareArgs<'app_mention'>) => {
      try {
        logger(
          `App mentioned: ${event.text} from user ${event.user} in channel ${event.channel} (event_ts: ${event.event_ts}, thread_ts: ${event.thread_ts})`
        );

        if (!event.user) {
          throw new Error('User ID is required');
        }

        const prevSession = event.thread_ts
          ? await this.database.findSessionBySlackThread({
              channelId: event.channel,
              threadTs: event.thread_ts,
            })
          : undefined;
        logger(`Prev session: ${prevSession?.id}`);

        if (prevSession && prevSession.slack.userId !== event.user) {
          await this.app.client.chat.postEphemeral({
            channel: event.channel,
            user: event.user,
            ...(event.thread_ts ? { thread_ts: event.thread_ts } : {}),
            text: 'You are not authorized to start a new session',
          });
          return;
        }

        const session = await this.database.createSessionFromSlackThread({
          channelId: event.channel,
          threadTs: event.thread_ts ?? event.ts,
          userId: event.user,
        });

        const threadHistory = event.thread_ts
          ? await this.app.client.conversations.replies({
              channel: event.channel,
              ts: event.thread_ts,
            })
          : undefined;

        const systemPrompt = threadHistory?.messages
          ? generateSystemPrompt(threadHistory.messages)
          : '';

        let githubToken: string | undefined;
        if (this.github) {
          githubToken = await this.github.getTokenForUser(event.user);
        }

        await this.infra.start({
          initialInput: event.text,
          sessionId: session.id,
          sessionKey: session.key,
          resumeSessionId: prevSession?.id,
          systemPrompt,
          githubToken,
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
      this.app.action(actionId, async ({ ack, action, context, body }) => {
        await ack();
        if (!context.userId) {
          throw new Error('User ID is required');
        }
        if (!body.channel?.id) {
          throw new Error('Channel ID is required');
        }

        const postEphemeral = async (text: string) => {
          await this.app.client.chat.postEphemeral({
            channel: body.channel!.id!,
            user: body.user.id,
            thread_ts: (body as any).message.thread_ts,
            text,
          });
        };

        if (action.type === 'button') {
          if (!action.value) {
            throw new Error('No value found in action');
          }
          const actionValue = JSON.parse(action.value);
          const session = await this.database.getSession(
            actionValue.sessionId,
            actionValue.sessionKey
          );
          if (session.slack.userId !== context.userId) {
            // Send ephemeral message to the user
            await postEphemeral('You are not authorized to approve or deny this tool');
            return;
          }
          if (!session.pod) {
            await postEphemeral('Pod is not started yet');
            return;
          }
          await this.infra.approveOrDenyTool({
            namespace: session.pod.namespace,
            name: session.pod.name,
            requestId: actionValue.requestId,
            approve,
          });
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

function generateSystemPrompt(messages: MessageElement[]): string {
  let prompt = '';
  prompt += "You are called from a Slack thread. Here's the thread history:\n\n";
  prompt += messages.map((message) => `[${message.user}] ${message.text}`).join('\n');
  return prompt;
}
