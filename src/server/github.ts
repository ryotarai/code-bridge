import { createAppAuth } from '@octokit/auth-app';
import { Config } from './config.js';

export class GitHub {
  constructor(private config: Exclude<Config['github'], undefined>) {}

  async getTokenForUser(slackUserId: string): Promise<string | undefined> {
    for (const auth of this.config.auth) {
      switch (auth.type) {
        case 'installation':
          const repositoryIds = auth.installation.repositories
            ?.filter((repository) => repository.slackUserIds.includes(slackUserId))
            .map((repository) => repository.repositoryId);

          if (repositoryIds && repositoryIds.length > 0) {
            const appAuth = createAppAuth({
              appId: auth.installation.appId,
              privateKey: auth.installation.privateKey,
              clientId: auth.installation.clientId,
              clientSecret: auth.installation.clientSecret,
            });

            const token = await appAuth({
              type: 'installation',
              repositoryIds,
              installationId: auth.installation.installationId,
            });

            return token.token;
          }
          break;
        case 'static':
          if (auth.static.slackUserIds.includes(slackUserId)) {
            return auth.static.token;
          }
          break;
        default:
          auth satisfies never;
          throw new Error('Unsupported auth type');
      }
    }

    return undefined;
  }
}
