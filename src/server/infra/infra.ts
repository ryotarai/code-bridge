export type StartOptions = {
  initialInput: string;
  sessionId: string;
  sessionKey: string;
};

export interface Infra {
  start(options: StartOptions): Promise<void>;
}
