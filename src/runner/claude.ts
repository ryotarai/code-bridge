import { create } from '@bufbuild/protobuf';
import { createClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-node';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import {
  CreateClaudeCodeLogRequestSchema,
  CreateProgressMessageRequestSchema,
  ManagerService,
} from '../proto/manager/v1/service_pb.js';

interface ClaudeCodeLog {
  type: string;
  subtype?: string;
  sessionID?: string;
}

export async function runClaude({
  initialInput,
  mcpPort,
  apiServerURL,
  sessionId,
}: {
  initialInput: string;
  mcpPort: number;
  apiServerURL: string;
  sessionId: string;
}): Promise<void> {
  // Create client for code-bridge-server
  const transport = createConnectTransport({
    baseUrl: apiServerURL,
    httpVersion: '1.1',
  });

  const client = createClient(ManagerService, transport);

  // Create MCP config
  const mcpConfigPath = '/tmp/mcp-config.json';
  const mcpConfig = {
    mcpServers: {
      'permission-prompt': {
        type: 'sse',
        url: `http://localhost:${mcpPort}/sse`,
      },
    },
  };

  writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig), { mode: 0o644 });

  // Set up claude command arguments
  const args = [
    '--output-format',
    'stream-json',
    '--print',
    '--verbose',
    // '--mcp-config',
    // mcpConfigPath,
    // '--permission-prompt-tool',
    // 'mcp__permission-prompt__approval_prompt',
    '--debug',
  ];

  const claude = spawn('claude', args, {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stderrBuf = '';
  claude.stderr.on('data', (data) => {
    stderrBuf += data.toString();
  });

  // Send progress message
  try {
    await client.createProgressMessage(
      create(CreateProgressMessageRequestSchema, {
        text: 'Starting Claude Code',
        sessionId,
      })
    );
  } catch (error) {
    console.error('Failed to send progress message:', error);
  }

  // Send initial input to claude
  if (claude.stdin) {
    claude.stdin.write(initialInput + '\n');
    claude.stdin.end();
  }

  let sessionID = '';

  // Process claude output line by line
  let buffer = '';
  claude.stdout.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep the last incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue;

      console.log('Claude output:', line);

      if (line.startsWith('[DEBUG]')) {
        continue;
      }

      // Parse line as JSON
      try {
        const claudeCodeLog: ClaudeCodeLog = JSON.parse(line);

        // Send claude code log to manager service
        client
          .createClaudeCodeLog(
            create(CreateClaudeCodeLogRequestSchema, {
              payloadJson: line,
              sessionId,
            })
          )
          .catch((error) => {
            console.error('Failed to send claude code log:', error);
          });

        // Extract session ID from init message
        if (claudeCodeLog.type === 'system' && claudeCodeLog.subtype === 'init') {
          sessionID = claudeCodeLog.sessionID || '';
        }
      } catch (error) {
        console.error('Failed to parse claude code log:', error);
      }
    }
  });

  // Wait for claude to finish
  const exitCode = await new Promise<number | null>((resolve) => {
    claude.on('error', (error) => {
      console.error('Claude process error:', error);
      resolve(null);
    });
    claude.on('exit', resolve);
  });

  if (exitCode !== 0) {
    console.error(`Claude exited with code ${exitCode} (stderr: ${stderrBuf})`);
  } else {
    console.log(`Claude completed successfully (session: ${sessionID})`);
  }
}
