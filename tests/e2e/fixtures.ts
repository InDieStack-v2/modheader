import http from 'node:http';
import path from 'node:path';
import {
  test as base,
  chromium,
  type BrowserContext,
} from '@playwright/test';

/** Local HTTP server that echoes back the request headers it received. */
export interface EchoServer {
  url: string;
  readonly lastRequestHeaders: http.IncomingHttpHeaders | null;
  close(): Promise<void>;
}

async function startEchoServer(): Promise<EchoServer> {
  let lastRequestHeaders: http.IncomingHttpHeaders | null = null;
  const server = http.createServer((req, res) => {
    lastRequestHeaders = req.headers;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ url: req.url, headers: req.headers }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Echo server failed to start');
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    get lastRequestHeaders() {
      return lastRequestHeaders;
    },
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

function extensionPath(browser: 'chrome' | 'firefox'): string {
  return path.resolve(process.cwd(), `.output/${browser}-mv3`);
}

/**
 * Fixtures for extension E2E tests:
 * - `echoServer`: worker-scoped local header-echo server.
 * - `context`: browser context with the built extension loaded.
 * - `extensionId`: resolved from the background service worker (Chromium).
 *
 * NOTE: Playwright cannot load MV3 extensions into Firefox directly
 * (https://playwright.dev/docs/browsers#firefox). The Firefox project is kept
 * for config parity; its extension-loading path is a follow-up (see WXT e2e
 * testing docs). Do not run browsers in CI environments without displays.
 */
export const test = base.extend<
  { context: BrowserContext; extensionId: string },
  { echoServer: EchoServer }
>({
  echoServer: [
    async ({}, use) => {
      const server = await startEchoServer();
      await use(server);
      await server.close();
    },
    { scope: 'worker' },
  ],
  context: async ({ browserName }, use) => {
    if (browserName !== 'chromium') {
      throw new Error(
        `Extension loading is not supported for ${browserName} yet (see fixtures.ts note)`,
      );
    }
    const extensionDir = extensionPath('chrome');
    // channel 'chromium' = full Chromium build, whose new headless mode
    // supports loading extensions (the default headless shell does not).
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      args: [
        `--disable-extensions-except=${extensionDir}`,
        `--load-extension=${extensionDir}`,
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) {
      worker = await context.waitForEvent('serviceworker');
    }
    await use(worker.url().split('/')[2] ?? '');
  },
});

export { expect } from '@playwright/test';
