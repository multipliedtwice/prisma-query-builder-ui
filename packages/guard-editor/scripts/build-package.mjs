import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stageSource } from './stage-source.mjs';

const standalone = process.argv.includes('--standalone');
const stage = stageSource({ standalone });
try {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), standalone ? '../../..' : '..');
  const result = spawnSync('svelte-package', ['-i', stage.directory, '-o', path.join(root, 'dist')], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally { stage.cleanup(); }
