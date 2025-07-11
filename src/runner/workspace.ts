import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
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

async function moveAllFiles(srcDir: string, destDir: string): Promise<void> {
  try {
    const files = await fs.readdir(srcDir, { withFileTypes: true });

    for (const file of files) {
      const srcPath = path.join(srcDir, file.name);
      const destPath = path.join(destDir, file.name);

      // Simply move the file or directory
      await fs.rename(srcPath, destPath);
    }
  } catch (error) {
    throw new Error(`move files: ${error}`);
  }
}

export async function downloadWorkspace(downloadUrl: string): Promise<void> {
  const workspaceTarGz = '/tmp/downloaded-workspace.tar.gz';
  const extractTmpDir = '/workspace/__code_bridge_extract_tmp';

  try {
    await downloadFile(downloadUrl, workspaceTarGz);

    // Create temporary extraction directory
    await fs.mkdir(extractTmpDir, { recursive: true });

    // Extract to temporary directory
    await extractTarGz(workspaceTarGz, extractTmpDir);

    // Move all files from temp directory to workspace
    await moveAllFiles(extractTmpDir, '/workspace');

    // Clean up temporary directory
    await fs.rmdir(extractTmpDir);
  } catch (error) {
    logger.error({ error }, 'failed to download and extract workspace');
    throw error;
  }
}

async function downloadFile(downloadUrl: string, dest: string): Promise<void> {
  const response = await fetch(downloadUrl);
  const fileBuffer = await response.arrayBuffer();
  await fs.writeFile(dest, Buffer.from(fileBuffer));
}
