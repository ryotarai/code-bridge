export type Env = {
  initialInput: string;
  apiServerURL: string;
  sessionId: string;
  sessionKey: string;
  sessionUploadUrl: string;
  workspaceUploadUrl: string;
  sessionDownloadUrl: string | undefined;
  workspaceDownloadUrl: string | undefined;
  systemPrompt: string;
  githubToken: string | undefined;
};

export function getEnv(): Env {
  if (!process.env.INITIAL_INPUT) {
    throw new Error('INITIAL_INPUT is not set');
  }

  if (!process.env.API_SERVER_URL) {
    throw new Error('API_SERVER_URL is not set');
  }

  if (!process.env.SESSION_ID) {
    throw new Error('SESSION_ID is not set');
  }

  if (!process.env.SESSION_KEY) {
    throw new Error('SESSION_KEY is not set');
  }

  if (!process.env.SESSION_UPLOAD_URL) {
    throw new Error('SESSION_UPLOAD_URL is not set');
  }

  if (!process.env.WORKSPACE_UPLOAD_URL) {
    throw new Error('WORKSPACE_UPLOAD_URL is not set');
  }

  if (process.env.SYSTEM_PROMPT === undefined) {
    throw new Error('SYSTEM_PROMPT is not set');
  }

  return {
    initialInput: process.env.INITIAL_INPUT,
    apiServerURL: process.env.API_SERVER_URL,
    sessionId: process.env.SESSION_ID,
    sessionKey: process.env.SESSION_KEY,
    sessionUploadUrl: process.env.SESSION_UPLOAD_URL,
    workspaceUploadUrl: process.env.WORKSPACE_UPLOAD_URL,
    sessionDownloadUrl: process.env.SESSION_DOWNLOAD_URL,
    workspaceDownloadUrl: process.env.WORKSPACE_DOWNLOAD_URL,
    systemPrompt: process.env.SYSTEM_PROMPT,
    githubToken: process.env.GITHUB_TOKEN,
  };
}
