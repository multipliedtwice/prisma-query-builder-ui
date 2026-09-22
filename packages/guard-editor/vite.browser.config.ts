import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
export default defineConfig({
  root: 'test/browser',
  plugins: [tailwindcss(), svelte()],
  esbuild: { tsconfigRaw: JSON.stringify({ compilerOptions: { target: 'ES2022', verbatimModuleSyntax: true, useDefineForClassFields: true } }) },
  server: { host: '127.0.0.1', port: 4178, strictPort: true, hmr: false, fs: { allow: ['../../../../..'] } },
  build: { outDir: '../../.browser-build', emptyOutDir: true },
});
