import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const allowedPackages = new Set(['svelte', 'svelte/elements']);
const forbiddenIdentifiers = new Set([
  'fetch', 'localStorage', 'sessionStorage', 'indexedDB', 'caches', 'process', 'Deno', 'Bun',
  'window', 'document', 'navigator', 'location', 'globalThis', 'global', 'self',
  'XMLHttpRequest', 'WebSocket', 'EventSource', 'Worker', 'SharedWorker', 'BroadcastChannel',
  'FileSystemHandle', 'FileReader', 'eval', 'Function', 'require', 'console',
]);
const forbiddenPath = /(?:^|\/)(?:server|routes|execution|execute|workspace|persistence|database|db|api-client|node_modules)(?:[/.\-]|$)/i;
const message = (file, detail) => `${file}: ${detail}`;

export function inspectModule(source, filename) {
  const imports = [];
  const failures = [];
  if (filename.endsWith('.css')) {
    if (/@import\b|url\s*\(/i.test(source)) failures.push(message(filename, 'CSS may not import or fetch resources'));
    return { imports, failures };
  }
  const svelte = filename.endsWith('.svelte');
  const scripts = svelte ? [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/g)].map(match => match[1]) : [source];
  if (svelte) {
    if (/\{@html\b|<svelte:(?:window|document|body)\b|<(?:iframe|img|audio|video|object|embed|link)\b|\b(?:src|href|action|formaction|srcdoc)\s*=/i.test(source)) {
      failures.push(message(filename, 'Unsafe or resource-loading markup'));
    }
    for (const identifier of forbiddenIdentifiers) {
      if (new RegExp(`\\b${identifier}\\b`).test(source)) failures.push(message(filename, `Forbidden API token: ${identifier}`));
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
      if (ts.isImportEqualsDeclaration(node) || ts.isImportTypeNode(node) || node.kind === ts.SyntaxKind.ImportKeyword) failures.push(message(filename, 'Dynamic, type-query or require import is not allowed'));
      if (ts.isMetaProperty(node)) failures.push(message(filename, 'Environment/module metadata access is not allowed'));
      if (ts.isIdentifier(node) && forbiddenIdentifiers.has(node.text)) failures.push(message(filename, `Forbidden API identifier: ${node.text}`));
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
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const failures = [];
  const visited = new Set();
  const external = new Set();
  const entries = new Set();
  const inSource = file => file === sourceRoot || file.startsWith(`${sourceRoot}${path.sep}`);
  function resolveModule(from, specifier) {
    if (!specifier.startsWith('.')) {
      if (!allowedPackages.has(specifier)) failures.push(message(from, `Forbidden external import: ${specifier}`));
      else external.add(specifier);
      return null;
    }
    const candidate = path.resolve(path.dirname(from), specifier);
    if (!inSource(candidate)) { failures.push(message(from, `Import escapes source boundary: ${specifier}`)); return null; }
    const choices = candidate.endsWith('.js') ? [candidate.slice(0, -3) + '.ts', candidate] : [candidate];
    const resolved = choices.find(file => fs.existsSync(file) && fs.statSync(file).isFile());
    if (!resolved) { failures.push(message(from, `Unresolved relative import: ${specifier}`)); return null; }
    return fs.realpathSync(resolved);
  }
  for (const [subpath, conditions] of Object.entries(manifest.exports ?? {})) {
    if (!conditions || typeof conditions !== 'object' || typeof conditions.types !== 'string' || typeof conditions.import !== 'string') {
      failures.push(`Export ${subpath} requires explicit types and import targets`);
      continue;
    }
    for (const target of Object.values(conditions)) {
      if (typeof target !== 'string' || !target.startsWith('./dist/') || target.includes('*')) { failures.push(`Unsafe export ${subpath}`); continue; }
      const relative = target.slice('./dist/'.length).replace(/\.d\.ts$/, '.ts').replace(/\.js$/, '.ts');
      const file = path.join(sourceRoot, relative);
      if (!inSource(file) || !fs.existsSync(file)) failures.push(`Export ${subpath} has no corresponding source: ${relative}`);
      else entries.add(fs.realpathSync(file));
    }
  }
  function visit(file) {
    if (visited.has(file)) return;
    visited.add(file);
    const relative = path.relative(sourceRoot, file).replaceAll(path.sep, '/');
    if (!inSource(file)) { failures.push(message(file, 'Symlink escapes source boundary')); return; }
    if (forbiddenPath.test(relative)) failures.push(message(file, 'Forbidden module path'));
    if (!/\.(?:ts|svelte|css)$/.test(file)) { failures.push(message(file, 'Unsupported source module')); return; }
    const inspected = inspectModule(fs.readFileSync(file, 'utf8'), relative);
    failures.push(...inspected.failures);
    for (const specifier of inspected.imports) {
      const next = resolveModule(file, specifier);
      if (next) visit(next);
    }
  }
  for (const entry of entries) visit(entry);
  return { failures, files: [...visited].map(file => path.relative(root, file)).sort(), external: [...external].sort() };
}

export function assertPublicBoundary(root = packageRoot) {
  const result = inspectPublicGraph(root);
  if (result.failures.length) throw new Error(result.failures.join('\n'));
  return result;
}
