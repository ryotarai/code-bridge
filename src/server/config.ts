import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parse } from 'yaml';
import { z } from 'zod';
import { SecretManager } from './secretmanager';

// Define the configuration schema using Zod
export const ConfigSchema = z.object({
  server: z.object({
    host: z.string().default('localhost'),
    port: z.number().int().min(1).max(65535).default(3000),
  }),
  slack: z.object({
    appToken: z.string().min(1),
    botToken: z.string().min(1),
  }),
  logging: z
    .object({
      level: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    })
    .optional(),
  kubernetes: z.object({
    namespace: z.string().default('default'),
    configPath: z.string().optional(),
    runner: z.object({
      apiServerURL: z.string().min(1),
      image: z.string().min(1),
      podSpec: z.object({}).passthrough(),
      systemPrompt: z.string().optional(),
    }),
  }),
  storage: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('gcs'),
      gcs: z.object({
        bucket: z.string().min(1),
        prefix: z.string().default('files/'),
      }),
    }),
  ]),
  database: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('firestore'),
      firestore: z.object({
        projectId: z.string().min(1),
        databaseId: z.string().min(1),
      }),
    }),
  ]),
  github: z
    .object({
      auth: z.discriminatedUnion('type', [
        z.object({
          type: z.literal('app'),
          app: z.object({
            appId: z.number().min(1),
            clientId: z.string().min(1),
            clientSecret: z.string().min(1),
            privateKey: z.string().min(1),
            installationId: z.number().min(1),
          }),
        }),
        z.object({
          type: z.literal('static'),
          token: z.string().min(1),
        }),
      ]),
      repositories: z
        .array(
          z.object({
            repositoryId: z.number().min(1),
            writableSlackUserIds: z.array(z.string().min(1)),
          })
        )
        .optional(),
    })
    .optional(),
});

// TypeScript type inferred from the schema
export type Config = z.infer<typeof ConfigSchema>;

export class ConfigLoader {
  constructor(private secretManager: SecretManager) {}

  // Helper function to load configuration from a specific file
  async loadConfigFromFile(configPath: string): Promise<Config> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rawConfig: any = {};

    // Try to load from JSON file if specified
    try {
      const configFile = resolve(configPath);
      const fileContent = readFileSync(configFile, 'utf-8');
      rawConfig = parse(fileContent);
    } catch (error) {
      throw new Error(`Failed to load config file ${configPath}: ${error}`);
    }

    // Validate the configuration
    try {
      const config = ConfigSchema.parse(rawConfig);
      return this.fillSecrets(config);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.errors
          .map((err) => `${err.path.join('.')}: ${err.message}`)
          .join('\n');
        throw new Error(`Configuration validation failed:\n${errorMessages}`);
      }
      throw error;
    }
  }

  private async fillSecrets(config: Config) {
    config.slack.appToken = await this.resolveValue(config.slack.appToken);
    config.slack.botToken = await this.resolveValue(config.slack.botToken);

    switch (config.github?.auth.type) {
      case 'app':
        config.github.auth.app.clientSecret = await this.resolveValue(
          config.github.auth.app.clientSecret
        );
        config.github.auth.app.privateKey = await this.resolveValue(
          config.github.auth.app.privateKey
        );
        break;
      case 'static':
        config.github.auth.token = await this.resolveValue(config.github.auth.token);
        break;
    }

    return config;
  }

  private async resolveValue(value: string): Promise<string> {
    if (value.startsWith('sm://')) {
      return this.secretManager.getSecret(value.slice('sm://'.length));
    }
    if (value.startsWith('env://')) {
      const v = process.env[value.slice('env://'.length)];
      if (v === undefined) {
        throw new Error(`Environment variable ${value} not found`);
      }
      return v;
    }
    return value;
  }
}
