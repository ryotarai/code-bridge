import type {
  App as AppType,
  BlockAction,
  ButtonAction,
  SlackActionMiddlewareArgs,
} from '@slack/bolt';
import bolt from '@slack/bolt';
import { MessageElement } from '@slack/web-api/dist/types/response/ConversationsRepliesResponse.js';
import { Database } from './database/database.js';
import { GitHub } from './github.js';
import { Infra } from './infra/infra.js';
import { logger } from './logger.js';

const { App } = bolt;

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
    this.app.message(async ({ event, payload, context, message }) => {
      logger.debug({ message }, 'Message received');

      if (message.subtype !== undefined) {
        logger.info({ message }, 'Ignoring message with subtype');
        return;
      }

      if (!message.text) {
        return;
      }

      if (!message.text.includes(`<@${context.botUserId}>`)) {
        return;
      }

      const cleanText = message.text.replace(`<@${context.botUserId}>`, '').trim();
      logger.info({ cleanText, payload }, 'App mentioned');

      if (cleanText.trim() === 'STOP' && message.thread_ts) {
        const session = await this.database.findSessionBySlackThread({
          channelId: event.channel,
          threadTs: message.thread_ts,
        });
        if (!session) {
          await this.app.client.chat.postMessage({
            channel: event.channel,
            thread_ts: message.thread_ts,
            text: `:information_source: Session not found`,
          });
          return;
        }
        if (!['started', 'running'].includes(session.state)) {
          await this.app.client.chat.postMessage({
            channel: event.channel,
            thread_ts: message.thread_ts,
            text: `:information_source: Session is not running`,
          });
          return;
        }
        if (session.slack.userId !== message.user) {
          await this.app.client.chat.postMessage({
            channel: event.channel,
            thread_ts: message.thread_ts,
            text: `:information_source: You are not authorized to stop this session`,
          });
          return;
        }

        await this.infra.stop(session);
        return;
      }

      let targetThreadTs: string | undefined;

      try {
        logger.info(
          `App mentioned: ${message.text} from user ${message.user} in channel ${event.channel} (event_ts: ${event.event_ts}, thread_ts: ${message.thread_ts})`
        );

        if (!message.user) {
          throw new Error('User ID is required');
        }

        const prevSession = message.thread_ts
          ? await this.database.findSessionBySlackThread({
              channelId: event.channel,
              threadTs: message.thread_ts,
            })
          : undefined;
        logger.info(`Prev session: ${prevSession?.id}`);

        if (prevSession && ['started', 'running'].includes(prevSession.state)) {
          await this.app.client.chat.postMessage({
            channel: event.channel,
            ...(message.thread_ts ? { thread_ts: message.thread_ts } : {}),
            text: `:information_source: Session is running. If you want to interrupt it, type "<@${context.botUserId}> STOP"`,
          });
          return;
        }

        if (prevSession && prevSession.slack.userId !== message.user) {
          await this.app.client.chat.postEphemeral({
            channel: event.channel,
            user: message.user,
            ...(message.thread_ts ? { thread_ts: message.thread_ts } : {}),
            text: 'You are not authorized to start a new session from this thread',
          });
          return;
        }

        if (message.thread_ts) {
          const originalMessagePermalink = await this.app.client.chat.getPermalink({
            channel: event.channel,
            message_ts: message.ts,
          });

          if (!originalMessagePermalink.ok || !originalMessagePermalink.permalink) {
            throw new Error('Failed to get original message permalink');
          }

          // send a new message to the channel to start a thread
          const newMessage = await this.app.client.chat.postMessage({
            channel: event.channel,
            text: `<@${message.user}> Session started from <${originalMessagePermalink.permalink}|this message>`,
          });

          if (!newMessage.ok || !newMessage.ts) {
            logger.error({ newMessage }, 'Failed to send new message');
            throw new Error('Failed to send new message');
          }

          const newMessagePermalink = await this.app.client.chat.getPermalink({
            channel: event.channel,
            message_ts: newMessage.ts,
          });

          if (!newMessagePermalink.ok || !newMessagePermalink.permalink) {
            throw new Error('Failed to get new message permalink');
          }

          await this.app.client.chat.postMessage({
            channel: event.channel,
            thread_ts: message.thread_ts,
            text: `<${newMessagePermalink.permalink}|Session started>`,
          });

          targetThreadTs = newMessage.ts;
        } else {
          targetThreadTs = event.ts;
        }

        const session = await this.database.createSessionFromSlackThread({
          channelId: event.channel,
          threadTs: targetThreadTs,
          userId: message.user,
        });

        const threadHistory = message.thread_ts
          ? await this.app.client.conversations.replies({
              channel: event.channel,
              ts: message.thread_ts,
            })
          : undefined;

        const systemPrompt = threadHistory?.messages
          ? generateSystemPrompt(threadHistory.messages)
          : '';

        let githubToken: string | undefined;
        if (this.github) {
          githubToken = await this.github.getTokenForUser(message.user);
        }

        await this.infra.start({
          initialInput: cleanText,
          sessionId: session.id,
          sessionKey: session.key,
          resumeSessionId: prevSession?.id,
          systemPrompt,
          githubToken,
        });

        await this.app.client.chat.postMessage({
          channel: event.channel,
          thread_ts: targetThreadTs,
          text: message.text,
          blocks: [
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: `:information_source: Session starting...`,
                },
              ],
            },
          ],
        });
      } catch (error) {
        logger.error(`Error handling app mention: ${error}`);

        await this.app.client.chat.postMessage({
          channel: event.channel,
          thread_ts: targetThreadTs ?? message.thread_ts ?? message.ts,
          text: message.text,
          blocks: [
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: `:information_source: Error starting session: ${error instanceof Error ? error.message : 'Unknown error'}`,
                },
              ],
            },
          ],
        });
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
      this.app.action(
        actionId,
        async ({ ack, action, body }: SlackActionMiddlewareArgs<BlockAction<ButtonAction>>) => {
          await ack();
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
            if (session.slack.userId !== body.user.id) {
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

            // Update the message to disable buttons and show status
            if (body.message && body.message.ts) {
              const statusText = approve ? 'Approved' : 'Denied';
              const statusEmoji = approve ? ':white_check_mark:' : ':x:';

              await this.app.client.chat.update({
                channel: body.channel!.id!,
                ts: body.message.ts,
                text: `Tool ${statusText.toLowerCase()}`,
                blocks: [
                  ...(body.message.blocks || []).filter((block: any) => block.type !== 'actions'),
                  {
                    type: 'context',
                    elements: [
                      {
                        type: 'mrkdwn',
                        text: `${statusEmoji} ${statusText} by <@${body.user.id}>`,
                      },
                    ],
                  },
                ],
              });
            }
          }
        }
      );
    });
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      logger.info('Slack server is already running');
      return;
    }

    try {
      logger.info('Starting Slack Bolt app in Socket Mode...');
      await this.app.start();
      this.isRunning = true;
      logger.info('⚡️ Slack Bolt app started successfully');
    } catch (error) {
      logger.error(`Failed to start Slack server: ${error}`);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.info('Slack server is not running');
      return;
    }

    try {
      logger.info('Stopping Slack Bolt app...');
      await this.app.stop();
      this.isRunning = false;
      logger.info('Slack Bolt app stopped');
    } catch (error) {
      logger.error(`Failed to stop Slack server: ${error}`);
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
