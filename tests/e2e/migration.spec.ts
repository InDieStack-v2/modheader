import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, type BrowserContext, type Worker } from '@playwright/test';
import { expect, test } from './fixtures';
import type { Profile } from '../../lib/types';

/**
 * E2E upgrade/migration test (T040, quickstart scenario 9).
 *
 * Approach (documented per task): Playwright cannot seed an extension
 * origin's localStorage before the extension is first installed, so this
 * exercises the migration-on-startup fallback path (which shares
 * runMigrationIfNeeded with the onInstalled path):
 *   1. Launch the extension with a persistent user-data-dir; let the initial
 *      (empty-legacy) migration complete.
 *   2. Seed 2.3.2-format localStorage via an extension page (migration.html),
 *      then clear `migrationDone`.
 *   3. Restart the browser context with the same user-data-dir — the legacy
 *      localStorage survives, the background startup fallback runs the real
 *      offscreen-document migration.
 *   4. Assert migrated storage.local contents and that headers are modified
 *      WITHOUT the popup ever being opened.
 */

const LEGACY_PROFILES = [
  {
    title: 'Migrated 0',
    headers: [],
    respHeaders: [],
    filters: [],
    appendMode: '',
  },
  {
    title: 'Migrated 1',
    headers: [{ enabled: true, name: 'Via', value: 'migrated' }],
    respHeaders: [],
    filters: [{ enabled: true, type: 'urls', urlPattern: '*://127.0.0.1*/*' }],
    appendMode: 'comma',
  },
];

interface ChromeLike {
  storage: {
    local: {
      get(keys?: string[] | null): Promise<Record<string, unknown>>;
      remove(keys: string | string[]): Promise<void>;
    };
  };
}

async function waitForWorker(context: BrowserContext): Promise<Worker> {
  let [worker] = context.serviceWorkers();
  if (!worker) {
    worker = await context.waitForEvent('serviceworker');
  }
  return worker;
}

async function getLocal(worker: Worker, keys: string[]) {
  return worker.evaluate(async (k: string[]) => {
    return (globalThis as unknown as { chrome: ChromeLike }).chrome.storage.local.get(k);
  }, keys);
}

function extensionPath(): string {
  return path.resolve(process.cwd(), '.output/chrome-mv3');
}

test('legacy 2.3.2 localStorage migrates on upgrade and headers work without opening the popup', async ({
  echoServer,
}) => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modheader-e2e-'));
  const launch = () =>
    chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath()}`,
        `--load-extension=${extensionPath()}`,
      ],
    });

  let context: BrowserContext | null = null;
  try {
    // --- First launch: initial (empty-legacy) migration runs ---
    context = await launch();
    let worker = await waitForWorker(context);
    await expect
      .poll(async () => (await getLocal(worker, ['migrationDone'])).migrationDone, { timeout: 20000 })
      .toBe(true);

    // --- Seed legacy localStorage via an extension page, then reset the flag ---
    const extensionId = worker.url().split('/')[2];
    const seedPage = await context.newPage();
    await seedPage.goto(`chrome-extension://${extensionId}/migration.html`);
    await seedPage.evaluate((profilesJson: string) => {
      localStorage.setItem('profiles', profilesJson);
      localStorage.setItem('selectedProfile', '1');
      localStorage.setItem('isPaused', 'true');
    }, JSON.stringify(LEGACY_PROFILES));
    await worker.evaluate(async () => {
      await (globalThis as unknown as { chrome: ChromeLike }).chrome.storage.local.remove(
        'migrationDone',
      );
    });
    await context.close();

    // --- Relaunch: startup fallback runs the offscreen-document migration ---
    context = await launch();
    worker = await waitForWorker(context);
    await expect
      .poll(async () => (await getLocal(worker, ['migrationDone'])).migrationDone, { timeout: 20000 })
      .toBe(true);

    const state = await getLocal(worker, [
      'profiles',
      'selectedProfileIndex',
      'isPaused',
      'migrationDone',
    ]);
    const profiles = state.profiles as Profile[];
    expect(profiles).toHaveLength(2);
    expect(profiles[1]!.title).toBe('Migrated 1');
    expect(profiles[1]!.appendMode).toBe('comma');
    // Legacy wildcard filter converted on migration. The `*` after the host
    // absorbs the echo server's dynamic port (`host:port/`).
    const filter = profiles[1]!.filters[0]!;
    if (filter.type === 'urls') {
      expect(filter.urlRegex).toBe('.*:\\/\\/127\\.0\\.0\\.1.*\\/.*');
      expect(filter.urlPattern).toBeUndefined();
    } else {
      throw new Error('expected urls filter');
    }
    expect(state.selectedProfileIndex).toBe(1);
    expect(state.isPaused).toBe(true);

    // Header modification works without the popup ever being opened: unpause
    // (via storage, as the context menu would) and the migrated profile
    // applies. The seeded profile uses appendMode 'comma', whose DNR `append`
    // op Chrome only allows for allowlisted headers — hence `Via`.
    await worker.evaluate(async () => {
      await (globalThis as unknown as { chrome: ChromeLike }).chrome.storage.local.remove(
        'isPaused',
      );
    });
    const page = await context.newPage();
    const url = `${echoServer.url}/echo`;
    await page.goto(url);
    await expect
      .poll(async () =>
        page.evaluate(async (u: string) => {
          const res = await fetch(u);
          const body = (await res.json()) as { headers: Record<string, string> };
          return body.headers['via'];
        }, url),
      )
      .toBe('migrated');

    await context.close();
    context = null;
  } finally {
    // Always close the browser: a leaked context holds keep-alive connections
    // to the echo server open and hangs its fixture teardown.
    await context?.close().catch(() => undefined);
    // Best-effort cleanup: Chromium may still hold file locks on Windows
    // right after close; retry briefly, then leave the temp dir for the OS.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        fs.rmSync(userDataDir, { recursive: true, force: true });
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }
});
