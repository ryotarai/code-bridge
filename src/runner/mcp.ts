import { create } from '@bufbuild/protobuf';
import { Client } from '@connectrpc/connect';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import Fastify from 'fastify';
import crypto from 'node:crypto';
import { z } from 'zod';
import {
  CreateToolApprovalRequestRequestSchema,
  ManagerService,
} from '../proto/manager/v1/service_pb.js';
import { isToolApproved } from './connect.js';
import { logger } from './logger.js';

export async function startMcpServer({
  port,
  client,
  sessionId,
  sessionKey,
}: {
  port: number;
  client: Client<typeof ManagerService>;
  sessionId: string;
  sessionKey: string;
}): Promise<void> {
  // Create server instance
  const server = new McpServer({
    name: 'Approval MCP Server',
    version: '1.0.0',
    capabilities: {
      resources: {},
      tools: {},
    },
  });

  server.tool(
    'approval_prompt',
    'Permission check',
    {
      tool_name: z.string().describe('Tool name'),
      input: z.object({}).passthrough().describe('Input'),
    },
    async ({ tool_name, input }) => {
      logger.info({ tool_name, input }, 'MCP called');

      // Call CreateToolApprovalRequest

      const requestId = crypto.randomUUID();
      await client.createToolApprovalRequest(
        create(CreateToolApprovalRequestRequestSchema, {
          requestId,
          toolName: tool_name,
          input: JSON.stringify(input),
          session: {
            id: sessionId,
            key: sessionKey,
          },
        })
      );

      let result: boolean;
      const startTime = Date.now();
      const timeoutMs = 30 * 60 * 1000; // 30 minutes

      while (true) {
        const v = isToolApproved(requestId);
        if (v === undefined) {
          // Check if timeout exceeded
          if (Date.now() - startTime > timeoutMs) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ behavior: 'deny', message: 'Denied by timeout' }),
                },
              ],
            };
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        } else {
          result = v;
          break;
        }
      }

      if (result) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ behavior: 'allow', updatedInput: input }),
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ behavior: 'deny', message: 'Denied by user' }),
            },
          ],
        };
      }
    }
  );

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);

  const app = Fastify({ logger: true });

  // 3) POST handler for incoming requests
  app.post('/mcp', async (request, reply) => {
    try {
      // forward raw Node req, res and parsed body
      await transport.handleRequest(request.raw, reply.raw, request.body);
    } catch (err) {
      app.log.error(err);
      reply
        .code(500)
        .type('application/json')
        .send({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
    }
  });

  // 4) GET handler to open the SSE stream
  app.get('/mcp', async (request, reply) => {
    // no body needed for GET
    await transport.handleRequest(request.raw, reply.raw, undefined);
  });

  await app.listen({ port, host: '127.0.0.1' });
}
