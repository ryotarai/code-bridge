export type DbSession = {
  key: string;
  createdAt: FirebaseFirestore.Timestamp;
  slackThread: {
    channelId: string;
    threadTs: string;
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
  }: {
    channelId: string;
    threadTs: string;
  }): Promise<Session>;
  findSessionBySlackThread({
    channelId,
    threadTs,
  }: {
    channelId: string;
    threadTs: string;
  }): Promise<Session | null>;
}
