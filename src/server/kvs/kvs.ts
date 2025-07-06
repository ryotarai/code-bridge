import { Storage } from '@google-cloud/storage';
import { createHash } from 'node:crypto';
import { Config } from '../config';

export interface Kvs {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
}

export class InMemoryKvs implements Kvs {
  private store: Map<string, string> = new Map();

  async get<T>(key: string): Promise<T | null> {
    const value = this.store.get(key);
    if (!value) {
      return null;
    }
    return JSON.parse(value);
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, JSON.stringify(value));
  }
}

export class GcsKvs implements Kvs {
  constructor(
    private client: Storage,
    private bucket: string,
    private prefix: string
  ) {}

  async get<T>(key: string): Promise<T | null> {
    const [value] = await this.client.bucket(this.bucket).file(this.objectName(key)).download();
    return JSON.parse(value.toString());
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.client.bucket(this.bucket).file(this.objectName(key)).save(JSON.stringify(value));
  }

  private objectName(key: string): string {
    const hash = createHash('md5').update(key).digest('hex');
    return `${this.prefix}${hash}-${key}`;
  }
}

export function createKvs(config: Config['kvs']): Kvs {
  switch (config.type) {
    case 'inMemory':
      return new InMemoryKvs();
    case 'gcs':
      return new GcsKvs(new Storage(), config.gcs.bucket, config.gcs.prefix);
  }
}
