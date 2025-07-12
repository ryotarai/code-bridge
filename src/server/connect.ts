import type { ConnectRouter } from '@connectrpc/connect';
import { WebClient } from '@slack/web-api';
import { ManagerService, SessionState } from '../proto/manager/v1/service_pb.js';
import { Database } from './database/database.js';
import { logger } from './logger.js';

type ClaudeCodeAssistantPayload = {
  type: 'assistant';
  message: {
    id: string;
    type: 'message';
    role: 'assistant';
    model: string;
    content: Array<
      | {
          type: 'text';
          text: string;
        }
      | {
          type: 'tool_use';
          id: string;
          name: string;
          input: Record<string, any>;
        }
    >;
    stop_reason: string | null;
    stop_sequence: number | null;
    usage: {
      input_tokens: number;
      cache_creation_input_tokens: number;
      cache_read_input_tokens: number;
      output_tokens: number;
    };
  };
  parent_tool_use_id: string | null;
  session_id: string;
};

type ClaudeCodeSystemPayload = {
  type: 'system';
  subtype: 'init';
  cwd: string;
  session_id: string;
  tools: string[];
  mcp_servers: string[];
  model: string;
  permissionMode: string;
  apiKeySource: string;
};

// {"type":"result","subtype":"success","is_error":false,"duration_ms":4267,"duration_api_ms":4047,"num_turns":1,"result":"Hi!","session_id":"ca434967-7d00-42d1-8756-ad541cafe07d","total_cost_usd":0.050406,"usage":{"input_tokens":2,"cache_creation_input_tokens":13416,"cache_read_input_tokens":0,"output_tokens":6,"server_tool_use":{"web_search_requests":0},"service_tier":"standard"}}
type ClaudeCodeResultPayload = {
  type: 'result';
  subtype: 'success';
  session_id: string;
  result: {
    type: 'text';
    text: string;
  };
  is_error: boolean;
  duration_ms: number;
  duration_api_ms: number;
  num_turns: number;
  total_cost_usd: number;
  usage: {
    input_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
    output_tokens: number;
  };
};

type ClaudeCodeMessagePayload =
  | ClaudeCodeAssistantPayload
  | ClaudeCodeSystemPayload
  | ClaudeCodeResultPayload;

export const buildRoutes = ({
  slackClient,
  database,
}: {
  slackClient: WebClient;
  database: Database;
}): ((router: ConnectRouter) => void) => {
  return (router: ConnectRouter): void => {
    router.service(ManagerService, {
      // implements rpc CreateClaudeCodeLog
      async createClaudeCodeLog(req) {
        logger.info(
          { payloadJson: req.payloadJson, session: req.session },
          'CreateClaudeCodeLog called with'
        );

        if (!req.session) {
          throw new Error('Session is required');
        }

        const payload = JSON.parse(req.payloadJson) as ClaudeCodeMessagePayload;
        logger.info({ payload }, 'payload');

        if (payload.type === 'assistant') {
          const session = await database.getSession(req.session.id, req.session.key);

          for (const content of payload.message.content) {
            // Determine the message text based on content type
            let messageText: string;
            if (content.type === 'text') {
              messageText = content.text;
            } else {
              continue;
            }

            await slackClient.chat.postMessage({
              channel: session.slack.channelId,
              thread_ts: session.slack.threadTs,
              text: messageText, // fallback text
              blocks: [
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: messageText,
                  },
                },
              ],
            });
          }
        }

        return {};
      },

      // implements rpc CreateProgressMessage
      async createProgressMessage(req) {
        logger.info({ text: req.text, session: req.session }, 'CreateProgressMessage called with');

        // TODO: Implement progress message creation logic
        return {};
      },

      // implements rpc CreateToolApprovalRequest
      async createToolApprovalRequest(req) {
        logger.info(
          {
            requestId: req.requestId,
            toolName: req.toolName,
            input: req.input,
            session: req.session,
          },
          'CreateToolApprovalRequest called with'
        );

        if (!req.session) {
          throw new Error('Session is required');
        }

        const session = await database.getSession(req.session.id, req.session.key);

        await slackClient.chat.postMessage({
          channel: session.slack.channelId,
          thread_ts: session.slack.threadTs,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `Tool approval request`,
              },
              fields: [
                {
                  type: 'mrkdwn',
                  text: `*Tool name*: ${req.toolName}`,
                },
                {
                  type: 'mrkdwn',
                  text: `*Input*: \`${req.input}\``,
                },
              ],
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'Approve',
                  },
                  action_id: 'approve_tool',
                  value: JSON.stringify({
                    sessionId: req.session.id,
                    sessionKey: req.session.key,
                    requestId: req.requestId,
                  }),
                  style: 'primary',
                },
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'Deny',
                  },
                  action_id: 'deny_tool',
                  value: JSON.stringify({
                    sessionId: req.session.id,
                    sessionKey: req.session.key,
                    requestId: req.requestId,
                  }),
                  style: 'danger',
                },
              ],
            },
          ],
        });

        // TODO: Implement tool approval request creation logic
        return {};
      },

      async updateSessionState(req) {
        logger.info({ session: req.session, state: req.state }, 'UpdateSessionState called with');

        if (!req.session) {
          throw new Error('Session is required');
        }

        const session = await database.getSession(req.session.id, req.session.key);

        const state = (() => {
          switch (req.state) {
            case SessionState.STARTING:
              return 'starting';
            case SessionState.RUNNING:
              return 'running';
            case SessionState.FINISHED:
              return 'finished';
            case SessionState.FAILED:
              return 'failed';
            default:
              throw new Error('Invalid session state');
          }
        })();

        await database.updateSessionState(session.id, state);

        // Send an ephemeral message to the channel
        let text: string | undefined;
        switch (state) {
          case 'running':
            text = 'Session running...';
            break;
          case 'finished':
            text = 'Session finished';
            break;
          case 'failed':
            text = `Session failed${req.message ? `: ${req.message}` : ''}`;
            break;
        }

        if (text) {
          await slackClient.chat.postMessage({
            channel: session.slack.channelId,
            thread_ts: session.slack.threadTs,
            text,
            blocks: [
              {
                type: 'context',
                elements: [
                  {
                    type: 'mrkdwn',
                    text: `:information_source: ${text}`,
                  },
                ],
              },
            ],
          });
        }

        return {};
      },
    });
  };
};
