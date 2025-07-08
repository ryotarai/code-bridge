import { createClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-node';
import { ManagerService } from '../proto/manager/v1/service_pb.js';
import { downloadSession, runClaude, uploadSession } from './claude.js';
import { getEnv } from './env.js';
import { startMcpServer } from './mcp.js';
import { startServer } from './server.js';
import { downloadWorkspace, uploadWorkspace } from './workspace.js';

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

// Download session to resume
let resumeSessionId: string | undefined;
if (env.sessionDownloadUrl) {
  console.log('Downloading session to resume');
  resumeSessionId = await downloadSession(env.sessionDownloadUrl);
}

// Download workspace to resume
if (env.workspaceDownloadUrl) {
  console.log('Downloading workspace to resume');
  await downloadWorkspace(env.workspaceDownloadUrl);
}

// Run `claude` command
const { claudeSessionId } = await runClaude({
  mcpPort,
  initialInput: env.initialInput,
  sessionId: env.sessionId,
  sessionKey: env.sessionKey,
  resumeSessionId,
  client,
  systemPrompt: env.systemPrompt,
});

if (claudeSessionId) {
  console.log('Uploading Claude Code session');
  await uploadSession(claudeSessionId, env.sessionUploadUrl);
} else {
  console.error('No Claude Code session ID found');
}

// Upload workspace
console.log('Uploading workspace');
await uploadWorkspace(env.workspaceUploadUrl);

// Exit the process after runClaude completes
process.exit(0);
