import { defineConfig, devices } from '@playwright/test';

const executablePath = process.env.PW_CHROMIUM_PATH;
const webkit = process.env.PW_SKIP_WEBKIT !== '1';
const WEB = 4173;
const SERVER = 8787;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${WEB}`,
    trace: 'retain-on-failure',
    // A stuck click fails with a clear message instead of eating the whole test budget.
    actionTimeout: 20_000,
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium-pixel',
      use: { ...devices['Pixel 7'], launchOptions: executablePath ? { executablePath } : {} },
    },
    ...(webkit ? [{ name: 'webkit-iphone', use: { ...devices['iPhone 14'] } }] : []),
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: `pnpm --filter @tap-in/server start:node`,
          url: `http://localhost:${SERVER}/healthz`,
          // Game timers run faster in e2e (presence and expiry timers are never scaled).
          env: { PORT: String(SERVER), TIME_SCALE: process.env.E2E_TIME_SCALE ?? '0.4' },
          reuseExistingServer: !process.env.CI,
        },
        {
          command: `pnpm vite build && pnpm vite preview --port ${WEB} --strictPort`,
          url: `http://localhost:${WEB}`,
          env: { VITE_SERVER_URL: `http://localhost:${SERVER}` },
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      ],
});
