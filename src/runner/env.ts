export type Env = {
  initialInput: string;
  apiServerURL: string;
  sessionId: string;
  sessionKey: string;
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

  return {
    initialInput: process.env.INITIAL_INPUT,
    apiServerURL: process.env.API_SERVER_URL,
    sessionId: process.env.SESSION_ID,
    sessionKey: process.env.SESSION_KEY,
  };
}
