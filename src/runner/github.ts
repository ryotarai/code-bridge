import { writeFileSync } from 'fs';
import path from 'path';

export async function setupGitHub(githubToken: string): Promise<void> {
  const gitConfig =
    `[url "https://ryotarai:${githubToken}@github.com/"]\n` + '  insteadOf = https://github.com/';

  const homedir = process.env.HOME;
  if (!homedir) {
    throw new Error('HOME is not set');
  }

  writeFileSync(path.join(homedir, '.gitconfig'), gitConfig, { mode: 0o600 });
}
