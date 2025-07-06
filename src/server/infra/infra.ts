export type StartOptions = {
  initialInput: string;
  threadId: string;
};

export interface Infra {
  start(options: StartOptions): Promise<void>;
}
