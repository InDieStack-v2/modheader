import type { BrowserContext, Worker } from '@playwright/test';
import { expect, test } from './fixtures';
import type { Profile } from '../../lib/types';

/**
 * E2E cloud backup tests (T035): >8KB chunked round-trip and legacy-format
 * snapshot restore, driven through the popup's Cloud backup dialog against
 * real chrome.storage.sync.
 */

async function backgroundWorker(context: BrowserContext): Promise<Worker> {
  let [worker] = context.serviceWorkers();
  if (!worker) {
    worker = await context.waitForEvent('serviceworker');
  }
  return worker;
}

interface ChromeLike {
  storage: {
    local: {
      set(value: Record<string, unknown>): Promise<void>;
      get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
    };
    sync: {
      set(value: Record<string, unknown>): Promise<void>;
      get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
    };
  };
}

function chromeIn(worker: Worker) {
  return {
    setLocal: (state: Record<string, unknown>) =>
      worker.evaluate(async (s: Record<string, unknown>) => {
        await (globalThis as unknown as { chrome: ChromeLike }).chrome.storage
          .local.set(s);
      }, state),
    getLocal: (keys: string[] | null) =>
      worker.evaluate(async (k: string[] | null) => {
        return (globalThis as unknown as { chrome: ChromeLike }).chrome.storage
          .local.get(k ?? undefined);
      }, keys),
    setSync: (state: Record<string, unknown>) =>
      worker.evaluate(async (s: Record<string, unknown>) => {
        await (globalThis as unknown as { chrome: ChromeLike }).chrome.storage
          .sync.set(s);
      }, state),
    getSync: () =>
      worker.evaluate(() =>
        (globalThis as unknown as { chrome: ChromeLike }).chrome.storage.sync.get(
          null,
        ),
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

test.describe('cloud backup', () => {
  test('>8KB profile is chunked into sync storage and restores intact', async ({
    context,
    extensionId,
  }) => {
    const chrome = chromeIn(await backgroundWorker(context));
    const big = profileWith({
      title: 'Big Profile',
      headers: [{ enabled: true, name: 'X-Big', value: 'x'.repeat(20000) }],
    });
    await chrome.setLocal({ profiles: [big], selectedProfileIndex: 0 });

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);

    // Open the Cloud backup dialog from the overflow menu and back up.
    await popup.getByLabel('More').click();
    await popup.getByRole('menuitem', { name: 'Cloud backup' }).click();
    await popup.getByRole('button', { name: 'Backup now' }).click();
    await expect(popup.getByText('Backup saved')).toBeVisible();

    // The snapshot was written in chunked format (meta + >1 chunks).
    const syncItems = await chrome.getSync();
    const metaKey = Object.keys(syncItems).find((k) =>
      k.endsWith(':meta'),
    ) as string;
    expect(metaKey).toBeDefined();
    const meta = syncItems[metaKey] as { chunks: number };
    expect(meta.chunks).toBeGreaterThan(1);

    // Wipe local state, reload the popup (auto-creates an empty profile),
    // then restore from the snapshot. The auto-created profile may itself be
    // auto-backed-up (FR-002 parity) once migration completes, adding a
    // second snapshot — so target the entry listing our profile by name.
    await chrome.setLocal({ profiles: [], selectedProfileIndex: 0 });
    await popup.reload();
    await popup.getByLabel('More').click();
    await popup.getByRole('menuitem', { name: 'Cloud backup' }).click();
    await popup
      .getByRole('button', { name: /Backup at .*Big Profile/ })
      .click();
    await expect(
      popup.getByText('Profiles successfully import'),
    ).toBeVisible();

    const state = await chrome.getLocal(['profiles']);
    const profiles = state.profiles as Profile[];
    expect(profiles[0]!.title).toBe('Big Profile');
    expect(profiles[0]!.headers[0]!.value).toBe('x'.repeat(20000));
  });

  test('legacy single-item snapshot restores (with urlPattern conversion)', async ({
    context,
    extensionId,
  }) => {
    const chrome = chromeIn(await backgroundWorker(context));
    const legacy = [
      {
        title: 'Legacy Profile',
        headers: [{ enabled: true, name: 'X-Legacy', value: '1' }],
        respHeaders: [],
        appendMode: '',
        filters: [{ enabled: true, type: 'urls', urlPattern: '*://a.com/*' }],
      },
    ];
    await chrome.setSync({ '1700000000000': JSON.stringify(legacy) });
    await chrome.setLocal({ profiles: [profileWith({})], selectedProfileIndex: 0 });

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.getByLabel('More').click();
    await popup.getByRole('menuitem', { name: 'Cloud backup' }).click();
    await popup.getByRole('button', { name: /Backup at/ }).first().click();
    await expect(
      popup.getByText('Profiles successfully import'),
    ).toBeVisible();

    const state = await chrome.getLocal(['profiles']);
    const profiles = state.profiles as Profile[];
    expect(profiles[0]!.title).toBe('Legacy Profile');
    const filter = profiles[0]!.filters[0]!;
    if (filter.type === 'urls') {
      expect(filter.urlRegex).toBe('.*:\\/\\/a\\.com\\/.*');
      expect(filter.urlPattern).toBeUndefined();
    } else {
      throw new Error('expected urls filter');
    }
  });
});
