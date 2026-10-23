import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertPublicBoundary, inspectModule, inspectPublicGraph, packageRoot } from '../scripts/import-boundary.mjs';

test('all documented public exports stay within the browser-safe source graph', () => {
  const result = assertPublicBoundary();
  assert.ok(result.files.includes('src/svelte/SavedQueryWorkspace.svelte'));
  assert.ok(result.files.includes('src/adapters/dmmf.ts'));
  assert.ok(result.files.includes('src/core/compiler.ts'));
  assert.ok(result.files.includes('src/svelte/workspace.css'));
  assert.ok(result.files.length >= 20);
  assert.ok(result.files.some(file => file.endsWith('src/components/ArgTree.svelte')));
  assert.ok(result.files.some(file => file.endsWith('src/components/CodePreview.svelte')));
  assert.ok(result.files.some(file => file.endsWith('src/components/QueryEditor.svelte')));
  assert.ok(!result.external.some(name => /prisma|database|adapter/.test(name)));
});

for (const source of [
  'fetch("/data")', 'globalThis["fetch"]("/data")', 'window.localStorage.getItem("policy")',
  'process.env.SECRET', 'import.meta.env.SECRET', 'require("node:fs")',
  'import("./server.js")', 'type Hidden = import("./server.js").Hidden',
  'const value = input as any', 'const value = input as unknown as string',
  'new Function("return 1")', 'new WebSocket("wss://example.invalid")',
  'navigator.sendBeacon("/event")', 'console.log("policy")',
]) {
  test(`boundary scanner refuses ${source}`, () => assert.ok(inspectModule(source, 'candidate.ts').failures.length));
}
for (const source of [
  '<script>localStorage.clear()</script><p>Editor</p>',
  '<script>const url = "https://example.invalid"</script><img src={url} alt="" />',
  '<svelte:window onresize={() => {}} />', '<div>{@html markup}</div>',
  '<a href="https://example.invalid">Upload</a>',
]) {
  test(`boundary scanner refuses markup ${source}`, () => assert.ok(inspectModule(source, 'candidate.svelte').failures.length));
}
for (const source of ['@import "./external.css";', 'div{background:url(https://example.invalid/a)}']) {
  test('CSS cannot add a resource-loading side effect', () => assert.ok(inspectModule(source, 'styles.css').failures.length));
}

test('Svelte CSS globals are not runtime globals', () => {
  assert.deepEqual(inspectModule('<style>:global(.editor) { color: inherit; }</style><p>Editor</p>', 'candidate.svelte').failures, []);
});

test('scanner includes type-only imports and barrel re-exports', () => {
  assert.deepEqual(inspectModule('import type { X } from "./a.js"; export { y } from "./b.js";', 'index.ts').imports, ['./a.js', './b.js']);
});

for (const [name, contents] of [
  ['transitive server module', { 'index.ts': 'export * from "./wrapper.js";', 'wrapper.ts': 'export * from "./server/private.js";', 'server/private.ts': 'export const secret = 1;' }],
  ['Prisma type-only dependency', { 'index.ts': 'export type { PrismaClient } from "@prisma/client";' }],
  ['Node builtin dependency', { 'index.ts': 'import fs from "node:fs";' }],
  ['workspace escape', { 'index.ts': 'export * from "../outside.js";' }],
]) {
  test(`transitive graph rejects ${name}`, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-boundary-'));
    try {
      fs.mkdirSync(path.join(root, 'src'));
      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } } }));
      for (const [file, source] of Object.entries(contents)) {
        fs.mkdirSync(path.dirname(path.join(root, 'src', file)), { recursive: true });
        fs.writeFileSync(path.join(root, 'src', file), source);
      }
      assert.ok(inspectPublicGraph(root).failures.length > 0);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
}

test('consumer dependencies cannot inherit standalone Prisma or database adapters', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  assert.deepEqual(pkg.dependencies ?? {}, {});
  assert.ok(Object.keys(pkg.peerDependencies).includes('codemirror'));
  assert.ok(Object.keys(pkg.peerDependencies).every(name => !/prisma|database|adapter/.test(name)));
  assert.ok(Object.values(pkg.peerDependenciesMeta).every(value => value.optional));
  assert.equal(pkg.peerDependenciesMeta.svelte.optional, true);
  assert.ok(!Object.keys(pkg.devDependencies).some(name => /prisma|adapter|database/i.test(name)));
  assert.equal(pkg.private, true);
  assert.equal(pkg.version, undefined);
  assert.equal(pkg.scripts.prepare, undefined);
  assert.equal(pkg.scripts.postinstall, undefined);
});
