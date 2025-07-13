import * as k8s from '@kubernetes/client-node';
import { PassThrough } from 'stream';
import { Config } from '../config.js';
import { Database, Session } from '../database/database.js';
import { logger } from '../logger.js';
import { Storage } from '../storage/storage.js';
import { Infra, StartOptions } from './infra.js';

export class KubernetesInfra implements Infra {
  private k8sApi: k8s.CoreV1Api;
  private config: Config['kubernetes'];
  private database: Database;
  private k8sExec: k8s.Exec;
  private storage: Storage;
  private k8sWatch: k8s.Watch;

  constructor(config: Config['kubernetes'], database: Database, storage: Storage) {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();

    this.k8sApi = kc.makeApiClient(k8s.CoreV1Api);
    this.k8sExec = new k8s.Exec(kc);
    this.k8sWatch = new k8s.Watch(kc);
    this.config = config;
    this.database = database;
    this.storage = storage;
  }

  async start({
    initialInput,
    sessionId,
    sessionKey,
    resumeSessionId,
    systemPrompt,
    githubToken,
  }: StartOptions): Promise<void> {
    logger.info({ sessionId }, 'Starting Kubernetes pod for session');

    const fullSystemPrompt = [
      this.config.runner.defaultSystemPrompt,
      this.config.runner.systemPrompt,
      systemPrompt,
    ]
      .filter((v) => !!v)
      .join('\n---\n');

    // Create a secret
    const secret = await this.k8sApi.createNamespacedSecret({
      namespace: this.config.namespace,
      body: {
        metadata: {
          generateName: `code-bridge-runner-${sessionId.toLowerCase()}-`,
        },
        stringData: {
          SESSION_KEY: sessionKey,
          SESSION_UPLOAD_URL: await this.storage.getSessionUploadUrl(sessionId),
          WORKSPACE_UPLOAD_URL: await this.storage.getWorkspaceUploadUrl(sessionId),
          SYSTEM_PROMPT: fullSystemPrompt,
          ...(resumeSessionId
            ? {
                SESSION_DOWNLOAD_URL: await this.storage.getSessionDownloadUrl(resumeSessionId),
                WORKSPACE_DOWNLOAD_URL: await this.storage.getWorkspaceDownloadUrl(resumeSessionId),
              }
            : {}),
          ...(githubToken ? { GITHUB_TOKEN: githubToken } : {}),
        },
      },
    });

    // Create a pod (deep copy)
    const podSpec = JSON.parse(JSON.stringify(this.config.runner.podSpec)) as k8s.V1PodSpec;

    if (!podSpec.volumes) {
      podSpec.volumes = [];
    }

    podSpec.volumes.push({
      name: 'code-bridge-workspace',
      emptyDir: {},
    });
    podSpec.volumes.push({
      name: 'code-bridge-home',
      emptyDir: {},
    });
    podSpec.volumes.push({
      name: 'code-bridge-tmp',
      emptyDir: {},
    });

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

    if (!mainContainer.volumeMounts) {
      mainContainer.volumeMounts = [];
    }
    mainContainer.volumeMounts.push({
      name: 'code-bridge-workspace',
      mountPath: '/workspace',
    });
    mainContainer.volumeMounts.push({
      name: 'code-bridge-home',
      mountPath: '/home/runner',
    });
    mainContainer.volumeMounts.push({
      name: 'code-bridge-tmp',
      mountPath: '/tmp',
    });

    if (!mainContainer.securityContext) {
      mainContainer.securityContext = {};
    }
    mainContainer.securityContext.readOnlyRootFilesystem = true;

    podSpec.restartPolicy = 'Never';
    if (!podSpec.securityContext) {
      podSpec.securityContext = {};
    }
    podSpec.securityContext.runAsNonRoot = true;
    podSpec.securityContext.seccompProfile = {
      type: 'RuntimeDefault',
    };

    const pods = await this.k8sApi.createNamespacedPod({
      namespace: this.config.namespace,
      body: {
        metadata: {
          generateName: `code-bridge-runner-${sessionId.toLowerCase()}-`,
        },
        spec: podSpec,
      },
    });
    logger.info({ pod: pods }, 'Created Kubernetes pod');

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

    await this.database.updatePod(sessionId, {
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
    logger.info({ namespace, name, requestId, approve }, 'KubernetesInfra.approveOrDenyTool');

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
        logger.info({ args }, 'Executing kubectl command');

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
      logger.error({ error: err }, 'Error approving or denying tool');
    }
  }

  async stop(session: Session): Promise<void> {
    if (!session.pod) {
      throw new Error('Pod not found');
    }

    logger.info({ sessionId: session.id }, 'Stopping Kubernetes pod for session');

    await this.k8sApi.deleteNamespacedPod({
      name: session.pod.name,
      namespace: this.config.namespace,
    });

    // watch the pod until it is deleted
    await new Promise<void>((resolve, reject) => {
      this.k8sWatch
        .watch(
          `/api/v1/namespaces/${this.config.namespace}/pods`,
          { fieldSelector: `metadata.name=${session.pod!.name}` },
          (phase) => {
            if (phase === 'DELETED') {
              resolve();
            }
          },
          (err: any) => {
            reject(err);
          }
        )
        .catch(reject);
    });

    await this.database.updateSessionState(session.id, 'finished');
  }
}
