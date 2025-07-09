import { createAppAuth } from '@octokit/auth-app';
import { Config } from './config.js';

export class GitHub {
  constructor(private config: Exclude<Config['github'], undefined>) {}

  async getTokenForUser(slackUserId: string): Promise<string | undefined> {
    switch (this.config.auth.type) {
      case 'app':
        const appAuth = createAppAuth({
          appId: this.config.auth.app.appId,
          privateKey: this.config.auth.app.privateKey,
          clientId: this.config.auth.app.clientId,
          clientSecret: this.config.auth.app.clientSecret,
        });
        const repositoryIds = this.config.repositories
          ?.filter((repository) => repository.writableSlackUserIds.includes(slackUserId))
          .map((repository) => repository.repositoryId);

        if (!repositoryIds || repositoryIds.length === 0) {
          return undefined;
        }

        const token = await appAuth({
          type: 'installation',
          repositoryIds,
          installationId: this.config.auth.app.installationId,
        });

        return token.token;
      case 'static':
        return this.config.auth.token;
      default:
        this.config.auth satisfies never;
        throw new Error('Unsupported auth type');
    }
  }
}
