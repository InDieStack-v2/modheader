import http from 'node:http';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import {
  test as base,
  chromium,
  type BrowserContext,
} from '@playwright/test';

/** Local HTTP server that echoes back the request headers it received. */
export interface EchoServer {
  url: string;
  readonly lastRequestHeaders: http.IncomingHttpHeaders | null;
  /** ws:// URL of the WebSocket echo endpoint on the same server. */
  wsUrl: string;
  readonly lastUpgradeHeaders: http.IncomingHttpHeaders | null;
  close(): Promise<void>;
}

async function startEchoServer(): Promise<EchoServer> {
  let lastRequestHeaders: http.IncomingHttpHeaders | null = null;
  let lastUpgradeHeaders: http.IncomingHttpHeaders | null = null;
  const server = http.createServer((req, res) => {
    if (req.url === '/ws-page') {
      res.setHeader('content-type', 'text/html');
      res.end(WS_PAGE);
      return;
    }
    lastRequestHeaders = req.headers;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ url: req.url, headers: req.headers }));
    });
  });
  // Echo every frame back; `__close:<code>:<reason>` closes with that code.
  const wss = new WebSocketServer({ server });
  wss.on('connection', (socket, req) => {
    lastUpgradeHeaders = req.headers;
    socket.on('message', (data, isBinary) => {
      const text = isBinary ? null : data.toString();
      const close = text?.match(/^__close:(\d+):(.*)$/);
      if (close) {
        socket.close(Number(close[1]), close[2]);
        return;
      }
      socket.send(data, { binary: isBinary });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Echo server failed to start');
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    wsUrl: `ws://127.0.0.1:${address.port}/echo`,
    get lastRequestHeaders() {
      return lastRequestHeaders;
    },
    get lastUpgradeHeaders() {
      return lastUpgradeHeaders;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        for (const client of wss.clients) {
          client.terminate();
        }
        wss.close();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

/** Page driving one WebSocket from tests via window.openWs/sendWs/closeWs. */
const WS_PAGE = `<!doctype html><title>ws</title><script>
let ws;
window.openWs = (url) => new Promise((resolve, reject) => {
  ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => resolve();
  ws.onerror = () => reject(new Error('ws error'));
});
window.sendWs = (data) => ws.send(Array.isArray(data) ? new Uint8Array(data) : data);
window.closeWs = (code, reason) => ws.send('__close:' + code + ':' + reason);
</script>`;

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
