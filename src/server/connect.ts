import type { ConnectRouter } from '@connectrpc/connect';
import { ManagerService } from '../proto/manager/v1/service_pb.js';

export default (router: ConnectRouter): ConnectRouter =>
  router.service(ManagerService, {
    // implements rpc CreateClaudeCodeLog
    async createClaudeCodeLog(req) {
      console.log('CreateClaudeCodeLog called with:', {
        payloadJson: req.payloadJson,
        slackThread: req.slackThread,
      });

      // TODO: Implement Claude Code log creation logic
      return {};
    },

    // implements rpc CreateProgressMessage
    async createProgressMessage(req) {
      console.log('CreateProgressMessage called with:', {
        text: req.text,
        slackThread: req.slackThread,
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
        slackThread: req.slackThread,
        podNamespace: req.podNamespace,
        podName: req.podName,
      });

      // TODO: Implement tool approval request creation logic
      return {};
    },
  });
