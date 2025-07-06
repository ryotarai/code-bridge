import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import Fastify from 'fastify';
import { z } from 'zod';

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
    console.log(tool_name, input);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ behavior: 'deny', message: 'All requests are denied' }),
        },
      ],
    };
  }
);

export async function startMcpServer(port: number): Promise<void> {
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
