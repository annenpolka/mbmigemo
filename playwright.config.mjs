import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.MBMIGEMO_TEST_PORT ?? 4174);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('MBMIGEMO_TEST_PORT must be a valid port');

export default defineConfig({
  testDir: './tests/browser',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.CI ? 2 : 3,
  reporter: [['list'], ['json', { outputFile: 'test-results/browser/results.json' }]],
  outputDir: 'test-results/browser/artifacts',
  use: { baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: { command: `node scripts/demo.mjs --port ${port}`, url: `http://127.0.0.1:${port}/health`, reuseExistingServer: false, timeout: 30_000 },
});
