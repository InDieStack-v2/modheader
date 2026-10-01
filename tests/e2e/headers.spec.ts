import type { BrowserContext, Worker } from '@playwright/test';
import { expect, test } from './fixtures';
import type { Profile } from '../../lib/types';

/**
 * E2E: request (T022) and response (T023) header modification via the built
 * extension against the local header-echo server (quickstart scenario 1).
 * Requires `npm run build` to have produced .output/chrome-mv3.
 */

async function backgroundWorker(context: BrowserContext): Promise<Worker> {
  let [worker] = context.serviceWorkers();
  if (!worker) {
    worker = await context.waitForEvent('serviceworker');
  }
  return worker;
}

interface ChromeStorageLike {
  storage: {
    local: {
      set(value: Record<string, unknown>): Promise<void>;
    };
  };
  declarativeNetRequest: {
    getSessionRules(): Promise<unknown[]>;
  };
}

async function seedProfiles(
  context: BrowserContext,
  profiles: Profile[],
): Promise<void> {
  const worker = await backgroundWorker(context);
  await worker.evaluate(async (state: Record<string, unknown>) => {
    const chromeApi = (globalThis as unknown as { chrome: ChromeStorageLike })
      .chrome;
    await chromeApi.storage.local.set(state);
  }, { profiles, selectedProfileIndex: 0 } as Record<string, unknown>);
}

/** Wait until the background has compiled at least one session rule. */
async function waitForRules(context: BrowserContext): Promise<void> {
  const worker = await backgroundWorker(context);
  await expect
    .poll(async () =>
      worker.evaluate(() => {
        const chromeApi = (globalThis as unknown as { chrome: ChromeStorageLike })
          .chrome;
        return chromeApi.declarativeNetRequest
          .getSessionRules()
          .then((rules) => rules.length);
      }),
    )
    .toBeGreaterThan(0);
}

function profileWith(partial: Partial<Profile>): Profile {
  return {
    title: 'Profile 1',
    headers: [],
    respHeaders: [],
    filters: [],
    appendMode: '',
    ...partial,
  };
}

test.describe('header modification', () => {
  // NOTE: assertions use in-page fetch() (xmlhttprequest) rather than
  // page.goto() because main_frame navigations were observed to bypass DNR
  // entirely in this Chrome-for-Testing environment (block rules ignored for
  // main_frame, enforced for xhr/subresources). On real Chrome/Firefox,
  // main_frame requests are modified too (manual verification, T024).
  test('request header is added to outgoing requests (T022)', async ({
    context,
    echoServer,
  }) => {
    await seedProfiles(context, [
      profileWith({
        headers: [
          { enabled: true, name: 'X-ModHeader-Test', value: 'request-value' },
        ],
      }),
    ]);
    await waitForRules(context);

    const page = await context.newPage();
    await page.goto(`${echoServer.url}/echo`); // same-origin page for fetch
    const headers = await page.evaluate(async (url: string) => {
      const res = await fetch(url);
      const body = (await res.json()) as { headers: Record<string, string> };
      return body.headers;
    }, `${echoServer.url}/echo`);
    expect(headers['x-modheader-test']).toBe('request-value');
  });

  test('skips invalid header names without rejecting valid rules', async ({
    context,
    echoServer,
  }) => {
    await seedProfiles(context, [
      profileWith({
        headers: [
          { enabled: true, name: 'X Invalid', value: 'ignored' },
          { enabled: true, name: 'X-ModHeader-Test', value: 'request-value' },
        ],
      }),
    ]);
    await waitForRules(context);

    const page = await context.newPage();
    await page.goto(`${echoServer.url}/echo`);
    const headers = await page.evaluate(async (url: string) => {
      const res = await fetch(url);
      const body = (await res.json()) as { headers: Record<string, string> };
      return body.headers;
    }, `${echoServer.url}/echo`);
    expect(headers['x-modheader-test']).toBe('request-value');
    expect(headers['x invalid']).toBeUndefined();
  });

  test('response header is added to incoming responses (T023)', async ({
    context,
    echoServer,
  }) => {
    await seedProfiles(context, [
      profileWith({
        respHeaders: [
          { enabled: true, name: 'X-ModHeader-Resp', value: 'response-value' },
        ],
      }),
    ]);
    await waitForRules(context);

    const page = await context.newPage();
    await page.goto(`${echoServer.url}/echo`);
    const value = await page.evaluate(
      async (url: string) => (await fetch(url)).headers.get('x-modheader-resp'),
      `${echoServer.url}/echo`,
    );
    expect(value).toBe('response-value');
  });
});
