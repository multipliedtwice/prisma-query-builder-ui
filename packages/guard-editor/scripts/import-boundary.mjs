import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const libraryRoot = path.resolve(packageRoot, '../..');
const uiPackages = new Set(['svelte', 'svelte/elements', '@lucide/svelte', 'bits-ui', 'clsx', 'tailwind-merge', 'tailwind-variants',
  'codemirror', '@codemirror/state', '@codemirror/view', '@codemirror/lang-javascript', '@codemirror/theme-one-dark',
  'prettier/standalone', 'prettier/plugins/babel', 'prettier/plugins/estree']);
const dynamicPackages = new Set(['prettier/standalone', 'prettier/plugins/babel', 'prettier/plugins/estree']);
const forbiddenIdentifiers = new Set(['fetch', 'localStorage', 'sessionStorage', 'indexedDB', 'caches', 'process', 'Deno', 'Bun',
  'location', 'globalThis', 'global', 'self', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Worker', 'SharedWorker',
  'BroadcastChannel', 'FileSystemHandle', 'FileReader', 'eval', 'Function', 'require', 'console', 'sendBeacon', 'serviceWorker']);
const domIdentifiers = new Set(['window', 'document', 'navigator']);
const forbiddenPath = /(?:^|\/)(?:server|routes|execution|execute|persistence|database|db|api-client|queries-client|node_modules)(?:[/\.\-]|$)/i;
const sharedFiles = new Set(['components/ArgTree.svelte', 'components/CodePreview.svelte', 'components/QueryEditor.svelte', 'components/QueryTabBar.svelte',
  'lib/code-generator.ts', 'lib/dmmf-utils.ts', 'lib/utils.ts']);
const sharedUi = /^lib\/components\/ui\/(?:button|card|switch|label)\/[^/]+\.(?:svelte|ts)$/;
const inside = (root, file) => file === root || file.startsWith(root + path.sep);
const message = (file, detail) => `${file}: ${detail}`;

export function inspectModule(source, filename, { ui = false } = {}) {
  const imports = []; const failures = [];
  if (filename.endsWith('.css')) {
    if (/@import\b|url\s*\(/i.test(source)) failures.push(message(filename, 'CSS may not import or fetch resources'));
    return { imports, failures };
  }
  const svelte = filename.endsWith('.svelte');
  const scripts = svelte ? [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/g)].map(match => match[1]) : [source];
  if (svelte) {
    if (/\{@html\b|<svelte:(?:window|document|body)\b|<(?:iframe|img|audio|video|object|embed|link)\b|\b(?:src|action|formaction|srcdoc)\s*=/i.test(source)) failures.push(message(filename, 'Unsafe or resource-loading markup'));
    if (/\bhref\s*=/.test(source) && !(ui && /\/button\/button\.svelte$/.test(filename))) failures.push(message(filename, 'Resource navigation is not part of the controlled editor'));
    for (const identifier of [...forbiddenIdentifiers, ...(ui ? [] : domIdentifiers)]) {
      if (new RegExp(`(?<![A-Za-z-])${identifier}(?![A-Za-z-])`).test(source)) failures.push(message(filename, `Forbidden API token: ${identifier}`));
    }
  }
  for (const [index, script] of scripts.entries()) {
    const ast = ts.createSourceFile(`${filename}.${index}.ts`, script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    for (const diagnostic of ast.parseDiagnostics) failures.push(message(filename, ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')));
    function walk(node) {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        if (node.moduleSpecifier) {
          if (ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
          else failures.push(message(filename, 'Nonliteral module boundary'));
        }
      }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const argument = node.arguments[0];
        if (ui && argument && ts.isStringLiteral(argument) && dynamicPackages.has(argument.text)) imports.push(argument.text);
        else failures.push(message(filename, 'Dynamic module loading is not allowed'));
      }
      if (ts.isImportEqualsDeclaration(node) || ts.isImportTypeNode(node)) failures.push(message(filename, 'Type-query or require import is not allowed'));
      if (ts.isMetaProperty(node)) failures.push(message(filename, 'Environment/module metadata access is not allowed'));
      const metadataLocation = ts.isIdentifier(node) && node.text === 'location' && ((ts.isPropertySignature(node.parent) && node.parent.name === node) || (ts.isPropertyAssignment(node.parent) && node.parent.name === node) || (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node && ts.isIdentifier(node.parent.expression) && !['window', 'document', 'navigator', 'globalThis', 'self'].includes(node.parent.expression.text)));
      if (ts.isIdentifier(node) && !metadataLocation && (forbiddenIdentifiers.has(node.text) || (!ui && domIdentifiers.has(node.text)))) failures.push(message(filename, `Forbidden API identifier: ${node.text}`));
      if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression) && forbiddenIdentifiers.has(node.argumentExpression.text)) failures.push(message(filename, 'Forbidden computed API access'));
      if ((ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) && node.type.kind === ts.SyntaxKind.AnyKeyword) failures.push(message(filename, 'as any is not allowed'));
      if ((ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) && (ts.isAsExpression(node.expression) || ts.isTypeAssertionExpression(node.expression)) && node.expression.type.kind === ts.SyntaxKind.UnknownKeyword) failures.push(message(filename, 'A cast through unknown is not allowed'));
      ts.forEachChild(node, walk);
    }
    walk(ast);
  }
  return { imports: [...new Set(imports)], failures: [...new Set(failures)] };
}
export function inspectPublicGraph(root = packageRoot) {
  const sourceRoot = fs.realpathSync(path.join(root, 'src'));
  const allowShared = fs.realpathSync(root) === fs.realpathSync(packageRoot);
  const originalSource = path.join(libraryRoot, 'src');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const failures = []; const visited = new Set(); const external = new Set(); const entries = new Set();
  function permitted(file) {
    if (inside(sourceRoot, file)) return true;
    if (!allowShared || !inside(originalSource, file)) return false;
    const relative = path.relative(originalSource, file).replaceAll(path.sep, '/');
    return sharedFiles.has(relative) || sharedUi.test(relative);
  }
  function resolveModule(from, specifier, ui) {
    if (!specifier.startsWith('.')) {
      if (!ui || !uiPackages.has(specifier)) failures.push(message(from, `Forbidden external import: ${specifier}`));
      else external.add(specifier);
      return null;
    }
    const candidate = path.resolve(path.dirname(from), specifier);
    const choices = candidate.endsWith('.js') ? [candidate.slice(0, -3) + '.ts', candidate] : [candidate];
    const resolved = choices.find(file => fs.existsSync(file) && fs.statSync(file).isFile());
    if (!resolved) { failures.push(message(from, `Unresolved relative import: ${specifier}`)); return null; }
    const real = fs.realpathSync(resolved);
    if (!permitted(real)) { failures.push(message(from, `Import escapes the approved shared source boundary: ${specifier}`)); return null; }
    return real;
  }
  for (const [subpath, conditions] of Object.entries(manifest.exports ?? {})) {
    if (!conditions || typeof conditions !== 'object' || typeof conditions.types !== 'string' || typeof conditions.import !== 'string') { failures.push(`Export ${subpath} requires explicit types and import targets`); continue; }
    for (const target of Object.values(conditions)) {
      if (typeof target !== 'string' || !target.startsWith('./dist/') || target.includes('*')) { failures.push(`Unsafe export ${subpath}`); continue; }
      const relative = target.slice('./dist/'.length).replace(/\.d\.ts$/, '.ts').replace(/\.js$/, '.ts');
      const file = path.join(sourceRoot, relative);
      if (!inside(sourceRoot, file) || !fs.existsSync(file)) failures.push(`Export ${subpath} has no corresponding source: ${relative}`);
      else entries.add(fs.realpathSync(file));
    }
  }
  function visit(file) {
    if (visited.has(file)) return;
    visited.add(file);
    if (!permitted(file)) { failures.push(message(file, 'Symlink escapes approved source boundary')); return; }
    const relative = path.relative(sourceRoot, file).replaceAll(path.sep, '/');
    if (forbiddenPath.test(relative)) failures.push(message(file, 'Forbidden module path'));
    if (!/\.(?:ts|svelte|css)$/.test(file)) { failures.push(message(file, 'Unsupported source module')); return; }
    const ui = file.includes(`${path.sep}svelte${path.sep}`) || file.includes(`${path.sep}components${path.sep}`) || file === path.join(originalSource, 'lib/utils.ts');
    const inspected = inspectModule(fs.readFileSync(file, 'utf8'), relative, { ui });
    failures.push(...inspected.failures);
    for (const specifier of inspected.imports) { const next = resolveModule(file, specifier, ui); if (next) visit(next); }
  }
  for (const entry of entries) visit(entry);
  return { failures, files: [...visited].map(file => path.relative(root, file)).sort(), external: [...external].sort() };
}
export function assertPublicBoundary(root = packageRoot) {
  const result = inspectPublicGraph(root);
  if (result.failures.length) throw new Error(result.failures.join('\n'));
  return result;
}
