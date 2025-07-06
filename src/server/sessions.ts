import crypto from 'crypto';
import { Kvs } from './kvs/kvs.js';

export interface Session {
  id: string;
  slackThread: {
    channelId: string;
    threadTs: string;
  };
}

export class SessionManager {
  constructor(private kvs: Kvs) {}

  async getSession(sessionId: string): Promise<Session | null> {
    const session = await this.kvs.get<Session>(this.kvsKey(sessionId));
    if (!session) {
      return null;
    }
    return session;
  }

  async createSessionFromSlackThread({
    channelId,
    threadTs,
  }: {
    channelId: string;
    threadTs: string;
  }): Promise<Session> {
    const sessionId = crypto.randomUUID();
    const session: Session = {
      id: sessionId,
      slackThread: {
        channelId,
        threadTs,
      },
    };
    await this.kvs.set(this.kvsKey(sessionId), session);
    return session;
  }

  private kvsKey(sessionId: string): string {
    return `session-${sessionId}`;
  }
}
