import type { ConnectRouter } from '@connectrpc/connect';
import { CreateToolApprovalResponseRequest, RunnerService } from '../proto/runner/v1/service_pb.js';

const approvalResult: Record<string, boolean | undefined> = {};

export function isToolApproved(requestId: string) {
  return approvalResult[requestId];
}

export default (router: ConnectRouter): ConnectRouter =>
  router.service(RunnerService, {
    // implements rpc CreateClaudeCodeLog
    async createToolApprovalResponse(req: CreateToolApprovalResponseRequest) {
      console.log('CreateToolApprovalResponse called with:', {
        requestId: req.requestId,
        approved: req.approved,
      });

      // TODO: confirm session key?

      approvalResult[req.requestId] = req.approved;

      return {};
    },
  });
