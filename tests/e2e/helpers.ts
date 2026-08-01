import type { BrowserContext, Worker } from '@playwright/test';
import type { Profile } from '../../lib/types';

/**
 * Shared helpers for popup e2e specs (spec 002): service-worker storage access
 * and profile factories, mirroring the patterns in parity.spec.ts.
 */

export async function backgroundWorker(context: BrowserContext): Promise<Worker> {
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
}

export function chromeIn(worker: Worker) {
  return {
    setLocal: (state: Record<string, unknown>) =>
      worker.evaluate(async (s: Record<string, unknown>) => {
        await (globalThis as unknown as { chrome: ChromeStorageLike }).chrome
          .storage.local.set(s);
      }, state),
    getLocal: (keys: string[]) =>
      worker.evaluate(async (k: string[]) => {
        return (globalThis as unknown as { chrome: ChromeStorageLike }).chrome
          .storage.local.get(k);
      }, keys),
  };
}

export function profileWith(partial: Partial<Profile>): Profile {
  return {
    title: 'Profile 1',
    headers: [],
    respHeaders: [],
    filters: [],
    appendMode: '',
    ...partial,
  };
}
