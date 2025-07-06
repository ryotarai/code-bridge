import type { ConnectRouter } from '@connectrpc/connect';
import { CreateToolApprovalResponseRequest, RunnerService } from '../proto/runner/v1/service_pb.js';

export default (router: ConnectRouter): ConnectRouter =>
  router.service(RunnerService, {
    // implements rpc CreateClaudeCodeLog
    async createToolApprovalResponse(req: CreateToolApprovalResponseRequest) {
      console.log('CreateToolApprovalResponse called with:', {
        requestId: req.requestId,
      });

      // TODO: Implement Claude Code log creation logic
      return {};
    },
  });
