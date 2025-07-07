import { createClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-node';
import { ManagerService } from '../proto/manager/v1/service_pb.js';
import { runClaude } from './claude.js';
import { getEnv } from './env.js';
import { startMcpServer } from './mcp.js';
import { startServer } from './server.js';

// env
const env = getEnv();

// Create client for code-bridge-server
const transport = createConnectTransport({
  baseUrl: env.apiServerURL,
  httpVersion: '1.1',
});
const client = createClient(ManagerService, transport);

// API server
const apiPort = 12947;
console.log(`Starting API server on port ${apiPort}`);
await startServer({ port: apiPort, host: '127.0.0.1' });

// MCP server
const mcpPort = 12948;
console.log(`Starting MCP server on port ${mcpPort}`);
await startMcpServer({
  port: mcpPort,
  client,
  sessionId: env.sessionId,
  sessionKey: env.sessionKey,
});

// Run `claude` command
await runClaude({
  mcpPort,
  initialInput: env.initialInput,
  sessionId: env.sessionId,
  sessionKey: env.sessionKey,
  client,
});

// Exit the process after runClaude completes
process.exit(0);
