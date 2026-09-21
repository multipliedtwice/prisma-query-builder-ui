import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertPublicBoundary, packageRoot } from './import-boundary.mjs';

const coreOnly = process.argv.includes('--core-only');
assert.ok(process.argv.slice(2).every(arg => arg === '--core-only'), 'Unknown export-check argument');
const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
const graph = assertPublicBoundary();
let checked = 0;
for (const [subpath, conditions] of Object.entries(manifest.exports)) {
  if (coreOnly && subpath === './svelte') continue;
  for (const target of new Set(Object.values(conditions))) {
    const absolute = path.resolve(packageRoot, target);
    assert.ok(absolute.startsWith(path.join(packageRoot, 'dist') + path.sep), `Export escapes dist: ${subpath}`);
    assert.ok(fs.existsSync(absolute) && fs.statSync(absolute).isFile(), `Missing built export ${subpath}: ${target}. Run the declared package build.`);
    assert.ok(fs.statSync(absolute).size > 0, `Empty export ${subpath}`);
  }
  if (subpath === './svelte') {
    assert.equal(conditions.svelte, conditions.import);
    assert.ok(fs.existsSync(path.join(packageRoot, 'dist/svelte/GuardShapeBuilder.svelte')));
    assert.ok(fs.existsSync(path.join(packageRoot, 'dist/svelte/GuardShapeBuilder.svelte.d.ts')));
    assert.ok(fs.existsSync(path.join(packageRoot, 'dist/svelte/styles.css')));
  } else {
    const exported = await import(pathToFileURL(path.join(packageRoot, conditions.import)).href);
    assert.ok(Object.keys(exported).length > 0, `Empty module ${subpath}`);
  }
  checked += 1;
}
const core = await import(pathToFileURL(path.join(packageRoot, 'dist/index.js')).href);
for (const symbol of ['readSchema', 'readCapabilities', 'readPolicy', 'validatePolicy', 'parsePolicy', 'serializePolicy', 'canonicalJson', 'compilePolicy', 'inspectEditorPolicy', 'proposePolicyChange']) {
  assert.equal(typeof core[symbol], 'function', `Missing public API ${symbol}`);
}
const adapter = await import(pathToFileURL(path.join(packageRoot, 'dist/adapters/dmmf.js')).href);
assert.equal(typeof adapter.normalizeDmmf, 'function');
console.log(`${checked} ${coreOnly ? 'headless ' : ''}exports checked; ${graph.files.length} source modules satisfy the public boundary.`);
if (coreOnly) console.log('/svelte build/export validation was explicitly not performed by this core-only command.');
