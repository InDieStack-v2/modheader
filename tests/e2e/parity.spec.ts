import type { BrowserContext, Page, Worker } from '@playwright/test';
import { expect, test } from './fixtures';
import type { Profile } from '../../lib/types';

/**
 * E2E parity tests (T034): profile switching, URL filter scoping, pause,
 * tab lock. Header assertions use in-page fetch() because main_frame
 * navigations bypass DNR in this Chrome-for-Testing environment
 * (see headers.spec.ts note). File import/export lives in dump.spec.ts.
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
      remove(keys: string | string[]): Promise<void>;
      get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
    };
  };
  declarativeNetRequest: {
    getSessionRules(): Promise<unknown[]>;
  };
  tabs: {
    query(query: object): Promise<{ id?: number }[]>;
  };
}

function chromeIn(worker: Worker) {
  return {
    setLocal: (state: Record<string, unknown>) =>
      worker.evaluate(async (s: Record<string, unknown>) => {
        await (globalThis as unknown as { chrome: ChromeStorageLike }).chrome
          .storage.local.set(s);
      }, state),
    removeLocal: (keys: string[]) =>
      worker.evaluate(async (k: string[]) => {
        await (globalThis as unknown as { chrome: ChromeStorageLike }).chrome
          .storage.local.remove(k);
      }, keys),
    getLocal: (keys: string[]) =>
      worker.evaluate(async (k: string[]) => {
        return (globalThis as unknown as { chrome: ChromeStorageLike }).chrome
          .storage.local.get(k);
      }, keys),
    ruleCount: () =>
      worker.evaluate(() =>
        (globalThis as unknown as { chrome: ChromeStorageLike }).chrome
          .declarativeNetRequest.getSessionRules()
          .then((r) => r.length),
      ),
    activeTabId: () =>
      worker.evaluate(() =>
        (globalThis as unknown as { chrome: ChromeStorageLike }).chrome.tabs
          .query({ active: true, currentWindow: true })
          .then((tabs) => tabs[0]?.id),
      ),
  };
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

async function fetchedHeaders(page: Page, url: string) {
  return page.evaluate(async (u: string) => {
    const res = await fetch(u);
    const body = (await res.json()) as { headers: Record<string, string> };
    return body.headers;
  }, url);
}

test.describe('US2 parity', () => {
  test('profile switch applies the newly selected profile rules', async ({
    context,
    echoServer,
  }) => {
    const chrome = chromeIn(await backgroundWorker(context));
    await chrome.setLocal({
      profiles: [
        profileWith({
          title: 'Alpha',
          headers: [{ enabled: true, name: 'X-Profile', value: 'alpha' }],
        }),
        profileWith({
          title: 'Beta',
          headers: [{ enabled: true, name: 'X-Profile', value: 'beta' }],
        }),
      ],
      selectedProfileIndex: 0,
    });
    await expect.poll(() => chrome.ruleCount()).toBe(1);

    const page = await context.newPage();
    await page.goto(`${echoServer.url}/echo`);
    const url = `${echoServer.url}/echo`;
    expect((await fetchedHeaders(page, url))['x-profile']).toBe('alpha');

    await chrome.setLocal({ selectedProfileIndex: 1 });
    await expect
      .poll(async () => (await fetchedHeaders(page, url))['x-profile'])
      .toBe('beta');
  });

  test('URL filter scopes where headers apply', async ({
    context,
    echoServer,
  }) => {
    const chrome = chromeIn(await backgroundWorker(context));
    const scoped = (urlRegex: string) =>
      profileWith({
        headers: [{ enabled: true, name: 'X-Scoped', value: 'yes' }],
        filters: [{ enabled: true, type: 'urls', urlRegex }],
      });
    await chrome.setLocal({
      profiles: [scoped('nomatch\\.example\\.com')],
      selectedProfileIndex: 0,
    });
    await expect.poll(() => chrome.ruleCount()).toBe(1);

    const page = await context.newPage();
    const url = `${echoServer.url}/echo`;
    await page.goto(url);
    expect((await fetchedHeaders(page, url))['x-scoped']).toBeUndefined();

    await chrome.setLocal({
      profiles: [scoped('127\\.0\\.0\\.1')],
      selectedProfileIndex: 0,
    });
    await expect
      .poll(async () => (await fetchedHeaders(page, url))['x-scoped'])
      .toBe('yes');
  });

  test('pause stops all modification until unpaused', async ({
    context,
    echoServer,
  }) => {
    const chrome = chromeIn(await backgroundWorker(context));
    await chrome.setLocal({
      profiles: [
        profileWith({
          headers: [{ enabled: true, name: 'X-Paused', value: 'yes' }],
        }),
      ],
      selectedProfileIndex: 0,
      isPaused: true,
    });
    await expect.poll(() => chrome.ruleCount()).toBe(0);

    const page = await context.newPage();
    const url = `${echoServer.url}/echo`;
    await page.goto(url);
    expect((await fetchedHeaders(page, url))['x-paused']).toBeUndefined();

    await chrome.removeLocal(['isPaused']);
    await expect
      .poll(async () => (await fetchedHeaders(page, url))['x-paused'])
      .toBe('yes');
  });

  test('tab lock scopes modification to the locked tab only', async ({
    context,
    echoServer,
  }) => {
    const chrome = chromeIn(await backgroundWorker(context));
    await chrome.setLocal({
      profiles: [
        profileWith({
          headers: [{ enabled: true, name: 'X-Locked', value: 'yes' }],
        }),
      ],
      selectedProfileIndex: 0,
    });
    await expect.poll(() => chrome.ruleCount()).toBe(1);

    const page = await context.newPage();
    const url = `${echoServer.url}/echo`;
    await page.goto(url);
    const tabId = await chrome.activeTabId();
    expect(tabId).toBeDefined();

    await chrome.setLocal({ lockedTabId: tabId });
    await expect
      .poll(async () => (await fetchedHeaders(page, url))['x-locked'])
      .toBe('yes');

    // Locked to a different tab: this tab's requests no longer match.
    await chrome.setLocal({ lockedTabId: (tabId ?? 0) + 100000 });
    await expect
      .poll(async () => (await fetchedHeaders(page, url))['x-locked'])
      .toBeUndefined();
  });

});

test.describe('compact layout (spec 002, US1)', () => {
  test('popup opens directly into the compact workspace', async ({
    context,
    extensionId,
  }) => {
    const chrome = chromeIn(await backgroundWorker(context));
    await chrome.setLocal({
      profiles: [
        profileWith({
          title: 'Compact',
          headers: Array.from({ length: 6 }, (_, i) => ({
            enabled: true,
            name: `X-Row-${i}`,
            value: `${i}`,
          })),
        }),
      ],
      selectedProfileIndex: 0,
    });

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);

    // Workspace is visible immediately — no drawer or extra step (FR-001/002).
    await expect(popup.getByText('Request Headers')).toBeVisible();
    await expect(popup.getByText('Response Headers')).toBeVisible();

    // No rotating tips or promotional prompts in the default view (FR-013).
    // Wait briefly so a would-be tip snackbar has time to mount (plain tips
    // auto-hide after 3s, so a retrying assertion would be flaky).
    await popup.waitForTimeout(500);
    expect(
      await popup.getByText(/Tip:|consider donating|leave us a review/i).count(),
    ).toBe(0);

    // At least 5 header rows visible without scrolling (SC-003).
    const bodyRows = popup.locator('tbody tr');
    await expect(bodyRows.first()).toBeVisible();
    expect(await bodyRows.count()).toBeGreaterThanOrEqual(5);
    for (const row of await bodyRows.all()) {
      await expect(row).toBeInViewport();
    }
  });

  test('popup theme follows the browser color scheme', async ({
    context,
    extensionId,
  }) => {
    const chrome = chromeIn(await backgroundWorker(context));
    await chrome.setLocal({
      profiles: [profileWith({})],
      selectedProfileIndex: 0,
    });

    const popup = await context.newPage();
    const bodyBg = () =>
      popup.evaluate(() => getComputedStyle(document.body).backgroundColor);

    await popup.emulateMedia({ colorScheme: 'dark' });
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popup.getByText('Request Headers')).toBeVisible();
    // MUI dark mode background (#121212).
    expect(await bodyBg()).toBe('rgb(18, 18, 18)');

    await popup.emulateMedia({ colorScheme: 'light' });
    await expect.poll(bodyBg).toBe('rgb(255, 255, 255)');
  });
});
