import { runClaude } from './claude.js';
import { getEnv } from './env.js';
import { startMcpServer } from './mcp.js';
import { startServer } from './server.js';

// API server
const apiPort = 12947;
console.log(`Starting API server on port ${apiPort}`);
await startServer({ port: apiPort, host: '127.0.0.1' });

// MCP server
const mcpPort = 12948;
console.log(`Starting MCP server on port ${mcpPort}`);
await startMcpServer(mcpPort);

// env
const env = getEnv();

// Run `claude` command
await runClaude({
  mcpPort,
  initialInput: env.initialInput,
  apiServerURL: env.apiServerURL,
  sessionId: env.sessionId,
});

// Exit the process after runClaude completes
process.exit(0);
