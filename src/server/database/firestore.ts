import { Firestore, Timestamp } from '@google-cloud/firestore';
import { timingSafeEqual } from 'crypto';
import { Database, DbSession, Session } from './database.js';

export class FirestoreDatabase implements Database {
  constructor(private client: Firestore) {}

  async getSession(id: string, key: string): Promise<Session> {
    const doc = await this.client.collection('sessions').doc(id).get();
    if (!doc.exists) {
      throw new Error('Session not found');
    }
    const dbSession = doc.data() as DbSession;
    if (!timingSafeEqual(Buffer.from(dbSession.key), Buffer.from(key))) {
      throw new Error('Invalid session key');
    }
    return {
      ...dbSession,
      id,
    };
  }

  async updatePod(id: string, pod: { namespace: string; name: string }): Promise<void> {
    await this.client
      .collection('sessions')
      .doc(id)
      .update({
        pod,
      } as Partial<Session>);
  }

  async createSessionFromSlackThread({
    channelId,
    threadTs,
  }: {
    channelId: string;
    threadTs: string;
  }): Promise<Session> {
    const dbSession: DbSession = {
      key: crypto.randomUUID(),
      createdAt: Timestamp.now(),
      slackThread: {
        channelId,
        threadTs,
      },
    };
    const doc = await this.client.collection('sessions').add(dbSession);
    return {
      ...dbSession,
      id: doc.id,
    };
  }

  async findSessionBySlackThread({
    channelId,
    threadTs,
  }: {
    channelId: string;
    threadTs: string;
  }): Promise<Session | null> {
    // First query by threadTs only to avoid composite index
    const docs = await this.client
      .collection('sessions')
      .where('slackThread.threadTs', '==', threadTs)
      .get();

    if (docs.empty) {
      return null;
    }

    // Filter by channelId and sort by createdAt in memory
    const matchingSessions = docs.docs
      .map((doc) => ({
        ...(doc.data() as DbSession),
        id: doc.id,
      }))
      .filter((session) => session.slackThread?.channelId === channelId)
      .sort((a, b) => {
        // Sort by createdAt desc (newest first)
        return b.createdAt.toMillis() - a.createdAt.toMillis();
      });

    return matchingSessions.length > 0 ? matchingSessions[0] : null;
  }
}
