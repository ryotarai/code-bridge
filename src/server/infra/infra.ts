export type StartOptions = {
  initialInput: string;
  sessionId: string;
};

export interface Infra {
  start(options: StartOptions): Promise<void>;
}
