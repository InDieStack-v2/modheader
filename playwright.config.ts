import { defineConfig } from '@playwright/test';

// E2E scaffolding (T004). Spec files land in later tasks (T022/T023, T034/T035, T040).
// Tests run against the built extension in .output/<browser>-mv3 (run `npm run build` first).
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
  ],
});
