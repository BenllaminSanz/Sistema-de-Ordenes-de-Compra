/**
 * Playwright — Fase 5 E2E (smoke del flujo visual).
 * Requiere MySQL de test (mismo guard que integración: DB_NAME *_test).
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.E2E_PORT || '3999';
const HOST = process.env.E2E_HOST || '127.0.0.1';
const baseURL = process.env.E2E_BASE_URL || `http://${HOST}:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.js',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: {
    command: 'node --import ./tests/setup-env.js tests/e2e/start-server.mjs',
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      PORT,
      NODE_ENV: 'test',
      SKIP_DB_EAGER_CHECK: '1',
      EMAIL_MOCK: '1',
    },
  },
});
