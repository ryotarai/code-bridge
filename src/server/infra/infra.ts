export type StartOptions = {
  initialInput: string;
  sessionId: string;
  sessionKey: string;
  resumeSessionId?: string | undefined;
  systemPrompt: string;
};

export interface Infra {
  start(options: StartOptions): Promise<void>;
  approveOrDenyTool({
    namespace,
    name,
    requestId,
    approve,
  }: {
    namespace: string;
    name: string;
    requestId: string;
    approve: boolean;
  }): Promise<void>;
}
