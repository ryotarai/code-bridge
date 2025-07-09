export type DbSession = {
  key: string;
  state: 'starting' | 'running' | 'finished' | 'failed';
  createdAt: FirebaseFirestore.Timestamp;
  slack: {
    channelId: string;
    threadTs: string;
    userId: string;
  };
  pod?: {
    namespace: string;
    name: string;
  };
};

export type Session = DbSession & {
  id: string;
};

export interface Database {
  getSession(id: string, key: string): Promise<Session>;
  updatePod(id: string, pod: { namespace: string; name: string }): Promise<void>;
  createSessionFromSlackThread({
    channelId,
    threadTs,
    userId,
  }: {
    channelId: string;
    threadTs: string;
    userId: string;
  }): Promise<Session>;
  findSessionBySlackThread({
    channelId,
    threadTs,
  }: {
    channelId: string;
    threadTs: string;
  }): Promise<Session | null>;
  updateSessionState(id: string, state: DbSession['state']): Promise<void>;
}
