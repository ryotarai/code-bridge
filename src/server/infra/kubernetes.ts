import * as k8s from '@kubernetes/client-node';
import { PassThrough } from 'stream';
import { Config } from '../config.js';
import { SessionManager } from '../sessions.js';
import { Infra, StartOptions } from './infra.js';

export class KubernetesInfra implements Infra {
  private k8sApi: k8s.CoreV1Api;
  private config: Config['kubernetes'];
  private sessionManager: SessionManager;
  private k8sExec: k8s.Exec;

  constructor(config: Config['kubernetes'], sessionManager: SessionManager) {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();

    this.k8sApi = kc.makeApiClient(k8s.CoreV1Api);
    this.k8sExec = new k8s.Exec(kc);
    this.config = config;
    this.sessionManager = sessionManager;
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

    secret.metadata?.ownerReferences?.push({
      apiVersion: 'v1',
      kind: 'Pod',
      name: pods.metadata!.name!,
      uid: pods.metadata!.uid!,
    });

    // Update the owner reference of the secret to the pod
    await this.k8sApi.replaceNamespacedSecret({
      name: secret.metadata!.name!,
      namespace: this.config.namespace,
      body: secret,
    });

    await this.sessionManager.updatePod(sessionId, sessionKey, {
      namespace: this.config.namespace,
      name: pods.metadata!.name!,
    });
  }

  async approveOrDenyTool({
    namespace,
    name,
    requestId,
    approve,
  }: {
    namespace: string;
    name: string;
    requestId: string;
    approve: boolean;
  }): Promise<void> {
    console.log('KubernetesInfra.approveOrDenyTool:', {
      namespace,
      name,
      requestId,
      approve,
    });

    const execPromise = new Promise<k8s.V1Status>((resolve, reject) => {
      try {
        const stdoutStream = new PassThrough();
        const stderrStream = new PassThrough();

        let stdoutData = '';
        let stderrData = '';

        stdoutStream.on('data', (chunk) => {
          stdoutData += chunk.toString();
        });

        stderrStream.on('data', (chunk) => {
          stderrData += chunk.toString();
        });

        const args = [
          'curl',
          '-fsSL',
          '--connect-timeout',
          '10',
          '--max-time',
          '30',
          '--retry',
          '3',
          '-X',
          'POST',
          '-H',
          'Content-Type: application/json',
          '-d',
          JSON.stringify({
            requestId,
            approved: approve,
          }),
          'http://localhost:12947/runner.v1.RunnerService/CreateToolApprovalResponse',
        ];
        console.log('args', args);

        this.k8sExec
          .exec(
            namespace,
            name,
            'main',
            args,
            stdoutStream,
            stderrStream,
            null,
            false,
            (status: k8s.V1Status) => {
              if (status.status === 'Success') {
                resolve(status);
              } else {
                reject(
                  new Error(
                    `Command failed with code ${status.code}: ${status.message}. stderr: ${stderrData}, stdout: ${stdoutData}`
                  )
                );
              }
            }
          )
          .catch((err) => {
            reject(err);
          });
      } catch (err) {
        reject(new Error(`Failed to execute k8s command: ${err}`));
      }
    });

    try {
      await execPromise;
    } catch (err) {
      console.error('Error approving or denying tool:', err);
    }
  }
}
