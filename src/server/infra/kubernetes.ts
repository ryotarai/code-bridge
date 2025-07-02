import * as k8s from '@kubernetes/client-node';
import { Infra } from './infra.js';

export class KubernetesInfra implements Infra {
  private k8sApi: k8s.CoreV1Api;

  constructor() {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();

    this.k8sApi = kc.makeApiClient(k8s.CoreV1Api);
  }

  async start(): Promise<void> {
    const pods = await this.k8sApi.listNamespacedPod({
      namespace: 'default',
    });
    console.log(pods);
  }
}
