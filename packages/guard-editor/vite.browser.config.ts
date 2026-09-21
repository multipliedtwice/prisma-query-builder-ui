import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
export default defineConfig({
  root: 'test/browser',
  plugins: [svelte()],
  server: { host: '127.0.0.1', port: 4178, strictPort: true, hmr: false },
  build: { outDir: '../../.browser-build', emptyOutDir: true },
});
