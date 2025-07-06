import * as k8s from '@kubernetes/client-node';
import { Config } from '../config.js';
import { Infra, StartOptions } from './infra.js';

export class KubernetesInfra implements Infra {
  private k8sApi: k8s.CoreV1Api;
  private config: Config['kubernetes'];

  constructor(config: Config['kubernetes']) {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();

    this.k8sApi = kc.makeApiClient(k8s.CoreV1Api);
    this.config = config;
  }

  async start({ initialInput, threadId }: StartOptions): Promise<void> {
    console.log('Starting Kubernetes pod for thread:', threadId);

    const podSpec = this.config.runner.podSpec as unknown as k8s.V1PodSpec;

    const mainContainer = ((): k8s.V1Container => {
      for (const container of podSpec.containers) {
        if (container.name === 'main') {
          return container;
        }
      }
      return {
        name: 'main',
      };
    })();

    if (!mainContainer.env) {
      mainContainer.env = [];
    }

    mainContainer.env.push({
      name: 'INITIAL_INPUT',
      value: initialInput,
    });
    mainContainer.env.push({
      name: 'API_SERVER_URL',
      value: this.config.runner.apiServerURL,
    });
    mainContainer.env.push({
      name: 'THREAD_ID',
      value: threadId,
    });

    mainContainer.image = this.config.runner.image;

    podSpec.restartPolicy = 'Never';

    const pods = await this.k8sApi.createNamespacedPod({
      namespace: this.config.namespace,
      body: {
        metadata: {
          generateName: `code-bridge-runner-${threadId.replaceAll('/', '-').replaceAll('.', '').toLowerCase()}-`,
        },
        spec: podSpec,
      },
    });
    console.log(pods);
  }
}
