import { defineConfig, devices } from '@playwright/test';

/**
 * Per-worktree port (QA-P1-10-005): several checkouts run e2e in parallel, so a fixed port would
 * make one run test another branch's build. Override with E2E_PORT; otherwise derive a stable port
 * from this checkout's path. The server is never reused: e2e always tests this checkout's build.
 */
function portForCheckout(): number {
  if (process.env.E2E_PORT) return Number(process.env.E2E_PORT);
  let h = 0;
  for (const ch of process.cwd()) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  return 41000 + (h % 2000);
}
const PORT = portForCheckout();

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
  ],
  webServer: {
    command: `pnpm --filter @them/game build && pnpm --filter @them/game preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
