import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit(), tailwindcss()],
  ssr: {
    external: [
      '@prisma/client',
      '@prisma/client/runtime/client',
      '@prisma/adapter-better-sqlite3',
      '@prisma/adapter-pg',
      '@prisma/adapter-mariadb',
      '@prisma/internals',
      'better-sqlite3',
    ],
    noExternal: []
  },
  optimizeDeps: {
    exclude: [
      '@prisma/client',
      '@prisma/adapter-better-sqlite3',
      '@prisma/adapter-pg',
      '@prisma/adapter-mariadb',
      '@prisma/internals',
      'better-sqlite3'
    ]
  },
   build: {
    rollupOptions: {
      external: [
        '@prisma/client/runtime/client'
      ]
    }
  }
});