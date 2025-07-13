import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parse } from 'yaml';
import { z } from 'zod';
import { SecretManager } from './secretmanager';

const defaultSystemPrompt = `
# Available Commands
- gh (GitHub CLI)
- ghcp (Commit files to GitHub)

# GitHub
When you commit files to the GitHub repository, you must use \`ghcp\` command instead of \`git\` in order to handle commit signing.

\`ghcp\` supports the following commands:
- Create a commit: \`ghcp commit -r OWNER/REPO -m "MESSAGE" file1 file2 ...\`
- Create a commit with a branch: \`ghcp commit -r OWNER/REPO -b BRANCH_NAME -m "MESSAGE" file1 file2 ...\`
- Create a commit with a branch and a parent: \`ghcp commit -r OWNER/REPO -b BRANCH_NAME --parent=PARENT_BRANCH -m "MESSAGE" file1 file2 ...\`

**Important**: Always use \`ghcp\` instead of \`git commit\` for all commit operations. Never use \`git commit\` directly.

After creating commits with \`ghcp\`, you can use \`git fetch\` or \`git pull\` to retrieve the commits.

# Repository Guidelines
If there is a CLAUDE.md file in the repository, please respect and follow the guidelines specified in that file.
`;

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
      defaultSystemPrompt: z.string().optional().default(defaultSystemPrompt),
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
      auth: z.array(
        z.discriminatedUnion('type', [
          z.object({
            type: z.literal('static'),
            static: z.object({
              token: z.string().min(1),
              slackUserIds: z.array(z.string().min(1)),
            }),
          }),
          z.object({
            type: z.literal('installation'),
            installation: z.object({
              appId: z.number().min(1),
              installationId: z.number().min(1),
              clientId: z.string().min(1),
              clientSecret: z.string().min(1),
              privateKey: z.string().min(1),
              repositories: z.array(
                z.object({
                  repositoryId: z.number().min(1),
                  slackUserIds: z.array(z.string().min(1)),
                })
              ),
            }),
          }),
        ])
      ),
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

    if (config.github?.auth) {
      for (const auth of config.github.auth) {
        switch (auth.type) {
          case 'installation':
            auth.installation.clientSecret = await this.resolveValue(
              auth.installation.clientSecret
            );
            auth.installation.privateKey = await this.resolveValue(auth.installation.privateKey);
            break;
          case 'static':
            auth.static.token = await this.resolveValue(auth.static.token);
            break;
        }
      }
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
