import { Storage as GcsClient } from '@google-cloud/storage';
import { Config } from '../config';

export interface Storage {
  getUploadUrl(key: string, contentType: string): Promise<string>;
  getDownloadUrl(key: string): Promise<string>;
  getSessionUploadUrl(sessionId: string): Promise<string>;
  getSessionDownloadUrl(sessionId: string): Promise<string>;
  getWorkspaceUploadUrl(sessionId: string): Promise<string>;
  getWorkspaceDownloadUrl(sessionId: string): Promise<string>;
}

export class GcsStorage implements Storage {
  constructor(
    private client: GcsClient,
    private bucket: string,
    private prefix: string
  ) {}

  async getSessionUploadUrl(sessionId: string): Promise<string> {
    return this.getUploadUrl(`sessions/${sessionId}.jsonl`, 'application/jsonl');
  }

  async getSessionDownloadUrl(sessionId: string): Promise<string> {
    return this.getDownloadUrl(`sessions/${sessionId}.jsonl`);
  }

  async getWorkspaceUploadUrl(sessionId: string): Promise<string> {
    return this.getUploadUrl(`workspaces/${sessionId}.tar.gz`, 'application/tar+gzip');
  }

  async getWorkspaceDownloadUrl(sessionId: string): Promise<string> {
    return this.getDownloadUrl(`workspaces/${sessionId}.tar.gz`);
  }

  async getUploadUrl(key: string, contentType: string): Promise<string> {
    const [url] = await this.client
      .bucket(this.bucket)
      .file(this.objectName(key))
      .getSignedUrl({
        action: 'write',
        expires: Date.now() + 1000 * 60 * 60 * 24,
        contentType,
      });
    return url;
  }

  async getDownloadUrl(key: string): Promise<string> {
    const [url] = await this.client
      .bucket(this.bucket)
      .file(this.objectName(key))
      .getSignedUrl({
        action: 'read',
        expires: Date.now() + 1000 * 60 * 60 * 24,
      });
    return url;
  }

  private objectName(key: string): string {
    return `${this.prefix}${key}`;
  }
}

export function createStorage(config: Config['storage']): Storage {
  switch (config.type) {
    case 'gcs':
      return new GcsStorage(new GcsClient(), config.gcs.bucket, config.gcs.prefix);
  }
}
