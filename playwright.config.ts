import { defineConfig } from '@playwright/test';

const useLocalEdge = !process.env.CI && process.platform === 'win32';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/mobile-ui-audit/report.json' }],
  ],
  use: {
    baseURL: 'http://localhost:4200',
    ...(useLocalEdge ? { channel: 'msedge' } : {}),
    headless: true,
    ignoreHTTPSErrors: true,
  },
  webServer: {
    command: 'npm start',
    url: 'http://localhost:4200',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
