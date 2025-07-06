import crypto, { timingSafeEqual } from 'crypto';
import { Kvs } from './kvs/kvs.js';

export interface Session {
  id: string;
  key: string;
  slackThread: {
    channelId: string;
    threadTs: string;
  };
}

export class SessionManager {
  constructor(private kvs: Kvs) {}

  async getSession(id: string, key: string): Promise<Session> {
    const session = await this.kvs.get<Session>(this.kvsKey(id));
    if (!session) {
      throw new Error('Session not found');
    }
    if (!timingSafeEqual(Buffer.from(session.key), Buffer.from(key))) {
      throw new Error('Invalid session key');
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
    const sessionKey = crypto.randomUUID();
    const session: Session = {
      id: sessionId,
      key: sessionKey,
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
