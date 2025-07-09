import { create } from '@bufbuild/protobuf';
import { Client } from '@connectrpc/connect';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  CreateClaudeCodeLogRequestSchema,
  CreateProgressMessageRequestSchema,
  ManagerService,
} from '../proto/manager/v1/service_pb.js';
import { logger } from './logger.js';

interface ClaudeCodeLog {
  type: string;
  subtype?: string;
  session_id?: string;
}

export async function runClaude({
  initialInput,
  mcpPort,
  sessionId,
  sessionKey,
  client,
  resumeSessionId,
  systemPrompt,
}: {
  initialInput: string;
  mcpPort: number;
  sessionId: string;
  sessionKey: string;
  client: Client<typeof ManagerService>;
  resumeSessionId: string | undefined;
  systemPrompt: string;
}): Promise<{ exitCode: number | null; claudeSessionId: string | undefined }> {
  // Create MCP config
  const mcpConfigPath = '/tmp/mcp-config.json';
  const mcpConfig = {
    mcpServers: {
      'permission-prompt': {
        type: 'http',
        url: `http://localhost:${mcpPort}/mcp`,
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
    '--mcp-config',
    mcpConfigPath,
    '--permission-prompt-tool',
    'mcp__permission-prompt__approval_prompt',
    '--append-system-prompt',
    systemPrompt,
    // '--debug',
  ];

  if (resumeSessionId) {
    args.push('--resume', resumeSessionId);
  }

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
        session: {
          id: sessionId,
          key: sessionKey,
        },
      })
    );
  } catch (error) {
    logger.error({ error }, 'Failed to send progress message');
  }

  // Send initial input to claude
  if (claude.stdin) {
    claude.stdin.write(initialInput + '\n');
    claude.stdin.end();
  }

  let claudeSessionId: string | undefined;

  // Process claude output line by line
  let buffer = '';
  claude.stdout.on('data', async (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep the last incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue;

      logger.info({ line }, 'Claude output');

      if (line.startsWith('[DEBUG]')) {
        continue;
      }

      // Parse line as JSON
      try {
        const claudeCodeLog: ClaudeCodeLog = JSON.parse(line);

        // Send claude code log to manager service
        await client.createClaudeCodeLog(
          create(CreateClaudeCodeLogRequestSchema, {
            payloadJson: line,
            session: {
              id: sessionId,
              key: sessionKey,
            },
          })
        );

        // Extract session ID from init message
        if (
          claudeCodeLog.type === 'system' &&
          claudeCodeLog.subtype === 'init' &&
          claudeCodeLog.session_id
        ) {
          claudeSessionId = claudeCodeLog.session_id;
        }
      } catch (error) {
        logger.error({ error }, 'Failed to parse claude code log');
      }
    }
  });

  // Wait for claude to finish
  const exitCode = await new Promise<number | null>((resolve) => {
    claude.on('error', (error) => {
      logger.error({ error }, 'Claude process error');
      resolve(null);
    });
    claude.on('exit', resolve);
  });

  if (exitCode !== 0) {
    logger.error({ exitCode, stderr: stderrBuf }, 'Claude exited with code %d', exitCode);
  } else {
    logger.info({ claudeSessionId }, 'Claude completed successfully');
  }

  return {
    exitCode,
    claudeSessionId,
  };
}

export async function uploadSession(claudeSessionId: string, sessionUploadUrl: string) {
  const sessionFilePath = `/home/runner/.claude/projects/-workspace/${claudeSessionId}.jsonl`;
  const sessionFile = readFileSync(sessionFilePath, 'utf8');
  const response = await fetch(sessionUploadUrl, {
    method: 'PUT',
    body: sessionFile,
    headers: {
      'Content-Type': 'application/jsonl',
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to upload session: ${response.statusText}: ${body}`);
  }
}

// Returns Claude Code session ID
export async function downloadSession(sessionDownloadUrl: string): Promise<string> {
  const sessionId = crypto.randomUUID().toLowerCase();
  const sessionFilePath = `/home/runner/.claude/projects/-workspace/${sessionId}.jsonl`;
  const response = await fetch(sessionDownloadUrl, {
    method: 'GET',
  });
  if (!response.ok) {
    throw new Error(`Failed to download session: ${response.statusText}`);
  }
  const sessionFile = await response.text();
  // Create the directory
  mkdirSync(dirname(sessionFilePath), { recursive: true });
  writeFileSync(sessionFilePath, sessionFile);
  return sessionId;
}
