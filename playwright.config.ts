import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/layout',
  outputDir: './test-results/layout',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5202',
    contextOptions: { reducedMotion: 'reduce' },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: {
    command: 'npm run harness -- --mode distribution --host 127.0.0.1 --port 5202',
    url: 'http://127.0.0.1:5202/markdown-tables.html',
    reuseExistingServer: false,
  },
})
