import { createAppAuth } from '@octokit/auth-app';
import { Config } from './config.js';

export class GitHub {
  private appAuth: ReturnType<typeof createAppAuth>;

  constructor(private config: Exclude<Config['github'], undefined>) {
    this.appAuth = createAppAuth({
      appId: this.config.auth.appId,
      privateKey: this.config.auth.privateKey,
      clientId: this.config.auth.clientId,
      clientSecret: this.config.auth.clientSecret,
    });
  }

  async getInstallationTokenForUser(slackUserId: string): Promise<string | undefined> {
    const repositoryIds = this.config.repositories
      ?.filter((repository) => repository.writableSlackUserIds.includes(slackUserId))
      .map((repository) => repository.repositoryId);

    if (!repositoryIds || repositoryIds.length === 0) {
      return undefined;
    }

    const token = await this.appAuth({
      type: 'installation',
      repositoryIds,
      installationId: this.config.auth.installationId,
    });

    return token.token;
  }
}
