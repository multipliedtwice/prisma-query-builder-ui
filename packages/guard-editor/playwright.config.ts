import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test/browser',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: './.browser-results',
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4178', browserName: 'chromium', trace: 'off', screenshot: 'only-on-failure' },
  webServer: { command: 'vite --config vite.browser.config.ts', url: 'http://127.0.0.1:4178', reuseExistingServer: false },
  projects: [
    { name: 'mobile-390x844', use: { viewport: { width: 390, height: 844 } } },
    { name: 'desktop-1440x900', use: { viewport: { width: 1440, height: 900 } } },
  ],
});
