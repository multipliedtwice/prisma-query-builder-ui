#!/usr/bin/env node
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..');
const entry = resolve(packageRoot, 'build', 'index.js');

if (!existsSync(entry)) {
  console.error('❌ build/index.js not found. Package may be corrupted.');
  console.error('   Expected:', entry);
  process.exit(1);
}

const port = process.env.PORT || 5173;

process.env.PRISMA_QUERY_BUILDER_PACKAGE_ROOT = packageRoot;

process.env.PORT = String(port);
process.env.HOST = process.env.HOST || '127.0.0.1';
process.env.ORIGIN = process.env.ORIGIN || `http://localhost:${port}`;

console.log(`Prisma Query Builder → http://localhost:${port}`);
console.log(`Working directory: ${process.cwd()}`);

await import(entry);