import type { ConnectRouter } from '@connectrpc/connect';
import { WebClient } from '@slack/web-api';
import { ManagerService } from '../proto/manager/v1/service_pb.js';
import { parseThreadId } from './thread.js';

type ClaudeCodeAssistantPayload = {
  type: 'assistant';
  message: {
    id: string;
    type: 'message';
    role: 'assistant';
    model: string;
    content: {
      type: 'text';
      text: string;
    }[];
    stop_reason: string | null;
    stop_sequence: number | null;
    parent_tool_use_id: string | null;
    session_id: string;
    usage: {
      input_tokens: number;
      cache_creation_input_tokens: number;
      cache_read_input_tokens: number;
      output_tokens: number;
    };
  };
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
};

type ClaudeCodeMessagePayload =
  | ClaudeCodeAssistantPayload
  | ClaudeCodeSystemPayload
  | ClaudeCodeResultPayload;

export const buildRoutes = ({
  slackClient,
}: {
  slackClient: WebClient;
}): ((router: ConnectRouter) => void) => {
  return (router: ConnectRouter): void => {
    router.service(ManagerService, {
      // implements rpc CreateClaudeCodeLog
      async createClaudeCodeLog(req) {
        console.log('CreateClaudeCodeLog called with:', {
          payloadJson: req.payloadJson,
          threadId: req.threadId,
        });

        const payload = JSON.parse(req.payloadJson) as ClaudeCodeMessagePayload;
        console.log('payload', payload);

        if (payload.type === 'assistant') {
          console.log('assistant', payload.message.content[0].text);
          const { type: threadType, channelId, threadTs } = parseThreadId(req.threadId);
          if (threadType === 'slack') {
            await slackClient.chat.postMessage({
              channel: channelId,
              thread_ts: threadTs,
              text: payload.message.content[0].text,
            });
          }
        }

        // TODO: Implement Claude Code log creation logic
        return {};
      },

      // implements rpc CreateProgressMessage
      async createProgressMessage(req) {
        console.log('CreateProgressMessage called with:', {
          text: req.text,
          threadId: req.threadId,
        });

        // TODO: Implement progress message creation logic
        return {};
      },

      // implements rpc CreateToolApprovalRequest
      async createToolApprovalRequest(req) {
        console.log('CreateToolApprovalRequest called with:', {
          requestId: req.requestId,
          toolName: req.toolName,
          input: req.input,
          threadId: req.threadId,
          podNamespace: req.podNamespace,
          podName: req.podName,
        });

        // TODO: Implement tool approval request creation logic
        return {};
      },
    });
  };
};
