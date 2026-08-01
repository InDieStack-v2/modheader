import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  // WxtVitest provides the `~`/`@/` aliases and replaces `wxt/browser`
  // with an in-memory fake browser for unit tests.
  plugins: [WxtVitest()],
  test: {
    include: ['tests/unit/**/*.test.ts'],
    setupFiles: ['tests/unit/setup.ts'],
  },
});
