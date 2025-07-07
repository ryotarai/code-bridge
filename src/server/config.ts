import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parse } from 'yaml';
import { z } from 'zod';

// Load environment variables
dotenv.config();

// Define the configuration schema using Zod
const ConfigSchema = z.object({
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
  kvs: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('inMemory'),
    }),
    z.object({
      type: z.literal('gcs'),
      gcs: z.object({
        bucket: z.string().min(1),
        prefix: z.string().default('kvs/'),
      }),
    }),
  ]),
});

// TypeScript type inferred from the schema
export type Config = z.infer<typeof ConfigSchema>;

// Helper function to load configuration from a specific file
export function loadConfigFromFile(configPath: string): Config {
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

  rawConfig.slack ||= {};
  if (process.env.SLACK_APP_TOKEN) {
    rawConfig.slack.appToken = process.env.SLACK_APP_TOKEN;
  }
  if (process.env.SLACK_BOT_TOKEN) {
    rawConfig.slack.botToken = process.env.SLACK_BOT_TOKEN;
  }

  // Validate the configuration
  try {
    return ConfigSchema.parse(rawConfig);
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

// Export the schema for external use (e.g., for generating example configs)
export { ConfigSchema };
