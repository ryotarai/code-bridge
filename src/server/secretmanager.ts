import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

export class SecretManager {
  constructor(private client: SecretManagerServiceClient) {}

  // name is in the format projects/{project}/secrets/{secret}/versions/{version}
  async getSecret(name: string) {
    const [version] = await this.client.accessSecretVersion({
      name: name,
    });

    if (!version.payload?.data) {
      throw new Error('No data found');
    }

    return version.payload.data.toString();
  }
}
