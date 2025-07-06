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

  async start({ initialInput, sessionId, sessionKey }: StartOptions): Promise<void> {
    console.log('Starting Kubernetes pod for session:', sessionId);

    // Create a secret
    const secret = await this.k8sApi.createNamespacedSecret({
      namespace: this.config.namespace,
      body: {
        metadata: {
          generateName: `code-bridge-runner-${sessionId.toLowerCase()}-`,
        },
        stringData: {
          SESSION_KEY: sessionKey,
        },
      },
    });

    // Create a pod
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
      name: 'SESSION_ID',
      value: sessionId,
    });

    mainContainer.image = this.config.runner.image;

    if (!mainContainer.envFrom) {
      mainContainer.envFrom = [];
    }
    mainContainer.envFrom.push({
      secretRef: {
        name: secret.metadata!.name!,
      },
    });

    podSpec.restartPolicy = 'Never';

    const pods = await this.k8sApi.createNamespacedPod({
      namespace: this.config.namespace,
      body: {
        metadata: {
          generateName: `code-bridge-runner-${sessionId.toLowerCase()}`,
        },
        spec: podSpec,
      },
    });
    console.log(pods);

    // Update the owner reference of the secret to the pod
    await this.k8sApi.patchNamespacedSecret({
      name: secret.metadata!.name!,
      namespace: this.config.namespace,
      body: {
        metadata: {
          ownerReferences: [
            {
              apiVersion: 'v1',
              kind: 'Pod',
              name: pods.metadata!.name!,
              uid: pods.metadata!.uid!,
            },
          ],
        },
      },
    });
  }
}
