import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  testDir: './test/shell', fullyParallel: false, workers: 1, retries: 0,
  outputDir: './.shell-results', reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4179', browserName: 'chromium', trace: 'off', screenshot: 'only-on-failure' },
  webServer: {
    command: 'npm run dev:guard-editor', cwd: fileURLToPath(new URL('../../../../frontend', import.meta.url)),
    url: 'http://127.0.0.1:4179', reuseExistingServer: false,
  },
  projects: [
    { name: 'mobile-390x844', use: { viewport: { width: 390, height: 844 } } },
    { name: 'desktop-1440x900', use: { viewport: { width: 1440, height: 900 } } },
  ],
});
