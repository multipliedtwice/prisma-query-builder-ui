import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { assertPublicBoundary, packageRoot, inspectModule } from './import-boundary.mjs';

const libraryRoot = path.resolve(packageRoot, '../..');
export function stageSource({ standalone = false } = {}) {
  const graph = assertPublicBoundary();
  const files = new Set(graph.files.map(file => path.resolve(packageRoot, file)));
  function collect(directory) {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, item.name);
      if (item.isDirectory()) collect(file);
      else if (/\.(?:ts|svelte|css)$/.test(item.name) && !/\.(?:test|spec)\./.test(item.name) && !item.name.startsWith('._')) files.add(file);
    }
  }
  if (standalone) collect(path.join(libraryRoot, 'src'));
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'query-builder-source-'));
  const stage = path.join(temporary, 'source');
  fs.mkdirSync(stage);
  if (standalone && fs.existsSync(path.join(libraryRoot, 'generated'))) fs.symlinkSync(path.join(libraryRoot, 'generated'), path.join(temporary, 'generated'), 'dir');
  const locations = new Map([...files].map(file => {
    const own = file.startsWith(path.join(packageRoot, 'src') + path.sep);
    const relative = path.relative(own ? path.join(packageRoot, 'src') : path.join(libraryRoot, 'src'), file);
    return [file, path.join(stage, own ? (standalone ? '_guard-editor' : '') : (standalone ? '' : 'shared'), relative)];
  }));
  try {
    for (const file of files) {
      let source = fs.readFileSync(file, 'utf8');
      const target = locations.get(file);
      const { imports } = inspectModule(source, file, { ui: true });
      for (const specifier of imports) {
        if (!specifier.startsWith('.') && !(standalone && specifier.startsWith('$lib/'))) continue;
        let resolved = specifier.startsWith('$lib/') ? path.resolve(libraryRoot, 'src/lib', specifier.slice(5)) : path.resolve(path.dirname(file), specifier);
        if (!locations.has(resolved)) {
          const alternate = [resolved + '.ts', resolved + '.svelte', path.join(resolved, 'index.ts')].find(candidate => locations.has(candidate));
          if (alternate) resolved = alternate;
        }
        if (resolved.endsWith('.js') && locations.has(resolved.slice(0, -3) + '.ts')) resolved = resolved.slice(0, -3) + '.ts';
        const next = locations.get(resolved);
        if (!next) {
          if (standalone && resolved.startsWith(path.join(libraryRoot, 'generated') + path.sep)) {
            if (!fs.existsSync(resolved)) throw new Error('The standalone query-history client is not generated. Run the existing prisma:generate:q command before packaging the playground. The controlled package does not require it.');
            continue;
          }
          throw new Error(`Source build is missing ${specifier} from ${file}`);
        }
        let relative = path.relative(path.dirname(target), next).replaceAll(path.sep, '/').replace(/\.ts$/, '.js');
        if (!relative.startsWith('.')) relative = './' + relative;
        source = source.split(`'${specifier}'`).join(`'${relative}'`).split(`"${specifier}"`).join(`"${relative}"`);
      }
      fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, source);
    }
    return { directory: stage, files: [...locations.values()], cleanup: () => fs.rmSync(temporary, { recursive: true, force: true }) };
  } catch (error) { fs.rmSync(temporary, { recursive: true, force: true }); throw error; }
}
