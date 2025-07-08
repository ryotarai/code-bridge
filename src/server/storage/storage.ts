import { Storage as GcsClient } from '@google-cloud/storage';
import { createHash } from 'node:crypto';
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
    return this.getUploadUrl(`${sessionId}-claude-session.jsonl`, 'application/jsonl');
  }

  async getSessionDownloadUrl(sessionId: string): Promise<string> {
    return this.getDownloadUrl(`${sessionId}-claude-session.jsonl`);
  }

  async getWorkspaceUploadUrl(sessionId: string): Promise<string> {
    return this.getUploadUrl(`${sessionId}-workspace.tar.gz`, 'application/tar+gzip');
  }

  async getWorkspaceDownloadUrl(sessionId: string): Promise<string> {
    return this.getDownloadUrl(`${sessionId}-workspace.tar.gz`);
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
    const hash = createHash('md5').update(key).digest('hex');
    return `${this.prefix}${hash}-${key}`;
  }
}

export function createStorage(config: Config['storage']): Storage {
  switch (config.type) {
    case 'gcs':
      return new GcsStorage(new GcsClient(), config.gcs.bucket, config.gcs.prefix);
  }
}
