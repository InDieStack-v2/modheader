import type { BrowserContext, Page, Worker } from '@playwright/test';
import { expect, test } from './fixtures';
import type { Profile } from '../../lib/types';

/**
 * E2E parity tests (T034): profile switching, URL filter scoping, pause,
 * tab lock, import/export round-trip. Header assertions use in-page fetch()
 * because main_frame navigations bypass DNR in this Chrome-for-Testing
 * environment (see headers.spec.ts note).
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

  test('import/export round-trip via the popup UI', async ({
    context,
    extensionId,
  }) => {
    const chrome = chromeIn(await backgroundWorker(context));
    const original = profileWith({
      title: 'E2E Export',
      headers: [{ enabled: true, name: 'X-Export-Test', value: 'v1' }],
    });
    await chrome.setLocal({ profiles: [original], selectedProfileIndex: 0 });

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);

    // Export: the dialog shows the serialized profile.
    await popup.getByLabel('More').click();
    await popup.getByRole('menuitem', { name: 'Export profile' }).click();
    const exported = await popup
      .getByRole('dialog')
      .locator('textarea')
      .first()
      .inputValue();
    const parsed = JSON.parse(exported) as Profile;
    expect(parsed.title).toBe('E2E Export');
    expect(parsed.headers[0]!.name).toBe('X-Export-Test');
    await popup.getByRole('button', { name: 'Done' }).click();

    // Import: paste a modified profile, success toast, storage updated.
    await popup.getByLabel('More').click();
    await popup.getByRole('menuitem', { name: 'Import profile' }).click();
    const modified = {
      ...original,
      title: 'E2E Imported',
      headers: [{ enabled: true, name: 'X-Export-Test', value: 'v2' }],
    };
    await popup
      .getByRole('dialog')
      .getByPlaceholder('Paste exported profile here')
      .fill(JSON.stringify(modified));
    await popup.getByRole('button', { name: 'Done' }).click();
    await expect(popup.getByText('Profile successfully import')).toBeVisible();
    await expect
      .poll(async () => {
        const state = await chrome.getLocal(['profiles']);
        const profiles = state.profiles as Profile[];
        return `${profiles[0]?.title}|${profiles[0]?.headers[0]?.value}`;
      })
      .toBe('E2E Imported|v2');

    // Import failure: toast + target profile unchanged (contract).
    await popup.getByLabel('More').click();
    await popup.getByRole('menuitem', { name: 'Import profile' }).click();
    await popup
      .getByRole('dialog')
      .getByPlaceholder('Paste exported profile here')
      .fill('this is not json');
    await popup.getByRole('button', { name: 'Done' }).click();
    await expect(popup.getByText('Failed to import profile')).toBeVisible();
    const state = await chrome.getLocal(['profiles']);
    expect((state.profiles as Profile[])[0]!.title).toBe('E2E Imported');
  });
});
