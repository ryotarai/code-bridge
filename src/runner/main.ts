import { createClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-node';
import { ManagerService, SessionState } from '../proto/manager/v1/service_pb.js';
import { downloadSession, runClaude, uploadSession } from './claude.js';
import { getEnv } from './env.js';
import { setupGitHub } from './github.js';
import { logger } from './logger.js';
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

async function main() {
  // API server
  const apiPort = 12947;
  logger.info({ port: apiPort }, 'Starting API server on port %d', apiPort);
  await startServer({ port: apiPort, host: '127.0.0.1' });

  // MCP server
  const mcpPort = 12948;
  logger.info({ port: mcpPort }, 'Starting MCP server on port %d', mcpPort);
  await startMcpServer({
    port: mcpPort,
    client,
    sessionId: env.sessionId,
    sessionKey: env.sessionKey,
  });

  // Download session to resume
  let resumeSessionId: string | undefined;
  if (env.sessionDownloadUrl) {
    logger.info('Downloading session to resume');
    resumeSessionId = await downloadSession(env.sessionDownloadUrl);
  }

  // Download workspace to resume
  if (env.workspaceDownloadUrl) {
    logger.info('Downloading workspace to resume');
    await downloadWorkspace(env.workspaceDownloadUrl);
  }

  // Setup GitHub
  if (env.githubToken) {
    logger.info('Setting up GitHub');
    await setupGitHub(env.githubToken);
  }

  // Update session state to running
  await client.updateSessionState({
    session: {
      id: env.sessionId,
      key: env.sessionKey,
    },
    state: SessionState.RUNNING,
  });

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
    logger.info('Uploading Claude Code session');
    await uploadSession(claudeSessionId, env.sessionUploadUrl);
  } else {
    logger.error('No Claude Code session ID found');
  }

  // Upload workspace
  logger.info('Uploading workspace');
  await uploadWorkspace(env.workspaceUploadUrl);
}

try {
  await main();
} catch (error) {
  await client.updateSessionState({
    session: {
      id: env.sessionId,
      key: env.sessionKey,
    },
    state: SessionState.FAILED,
    message: error instanceof Error ? error.message : 'Unknown error',
  });
  logger.error({ error }, 'Error in main');
  process.exit(1);
}

// finished
await client.updateSessionState({
  session: {
    id: env.sessionId,
    key: env.sessionKey,
  },
  state: SessionState.FINISHED,
});

process.exit(0);
