import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { logger } from './logger.js';

export async function uploadWorkspace(uploadUrl: string): Promise<void> {
  const workspaceTarGz = '/tmp/workspace.tar.gz';

  try {
    await createTarGz(workspaceTarGz, '/workspace');
  } catch (error) {
    logger.error({ error }, 'failed to create tar.gz');
    throw error;
  }

  try {
    await uploadFile(uploadUrl, workspaceTarGz);
  } catch (error) {
    logger.error({ error }, 'failed to upload workspace tar.gz');
    throw error;
  }
}

async function runTarCommand(args: string[], operationName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tarProcess = spawn('tar', args);

    let stderr = '';

    tarProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    tarProcess.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `${operationName}: process exited with code ${code}${stderr ? ` (stderr: ${stderr})` : ''}`
          )
        );
      } else {
        if (stderr) {
          logger.warn({ stderr, operationName }, 'tar command produced stderr');
        }
        resolve();
      }
    });

    tarProcess.on('error', (error) => {
      reject(new Error(`${operationName}: ${error.message}`));
    });
  });
}

async function createTarGz(dest: string, src: string): Promise<void> {
  return runTarCommand(['-zcf', dest, '-C', src, '.'], 'create tar.gz');
}

async function uploadFile(uploadUrl: string, filePath: string): Promise<void> {
  try {
    const fileBuffer = await fs.readFile(filePath);

    const response = await fetch(uploadUrl, {
      method: 'PUT',
      body: fileBuffer,
      headers: {
        'Content-Type': 'application/tar+gzip',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  } catch (error) {
    throw new Error(`upload file: ${error}`);
  }
}

async function extractTarGz(src: string, dest: string): Promise<void> {
  return runTarCommand(['--no-overwrite-dir', '-zxf', src, '-C', dest], 'extract tar.gz');
}

export async function downloadWorkspace(downloadUrl: string): Promise<void> {
  const workspaceTarGz = '/tmp/downloaded-workspace.tar.gz';
  await downloadFile(downloadUrl, workspaceTarGz);
  await extractTarGz(workspaceTarGz, '/workspace');
}

async function downloadFile(downloadUrl: string, dest: string): Promise<void> {
  const response = await fetch(downloadUrl);
  const fileBuffer = await response.arrayBuffer();
  await fs.writeFile(dest, Buffer.from(fileBuffer));
}
