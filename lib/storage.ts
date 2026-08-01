import { browser } from 'wxt/browser';
import type { Profile, RuntimeState } from './types';

/**
 * Typed chrome.storage.local helpers for the RuntimeState keys in
 * data-model.md. Uses the WXT-provided `browser` (webextension-polyfill) global.
 */

export const STORAGE_KEYS = [
  'profiles',
  'selectedProfileIndex',
  'isPaused',
  'lockedTabId',
  'activeTabUrl',
  'migrationDone',
] as const;

export type StorageKey = (typeof STORAGE_KEYS)[number];

export async function getProfiles(): Promise<Profile[]> {
  const { profiles } = await browser.storage.local.get('profiles');
  return (profiles as Profile[] | undefined) ?? [];
}

export async function setProfiles(profiles: Profile[]): Promise<void> {
  await browser.storage.local.set({ profiles });
}

export async function getRuntimeState(): Promise<RuntimeState> {
  const state = await browser.storage.local.get([...STORAGE_KEYS]);
  return {
    profiles: (state.profiles as Profile[] | undefined) ?? [],
    selectedProfileIndex:
      (state.selectedProfileIndex as number | undefined) ?? 0,
    isPaused: state.isPaused as boolean | undefined,
    lockedTabId: state.lockedTabId as number | undefined,
    activeTabUrl: state.activeTabUrl as string | undefined,
    migrationDone: state.migrationDone as boolean | undefined,
  };
}

export async function setRuntimeState(
  partial: Partial<RuntimeState>,
): Promise<void> {
  await browser.storage.local.set(partial);
}

/** Unset RuntimeState keys (absent = default, e.g. not paused / all tabs). */
export async function clearRuntimeState(keys: StorageKey[]): Promise<void> {
  await browser.storage.local.remove([...keys]);
}

/**
 * Subscribe to RuntimeState changes. The callback receives the full fresh
 * state whenever any RuntimeState key changes in storage.local.
 * Returns an unsubscribe function.
 */
export function subscribeRuntimeState(
  callback: (state: RuntimeState) => void,
): () => void {
  const listener = (
    changes: Record<string, unknown>,
    areaName: string,
  ): void => {
    if (areaName !== 'local') {
      return;
    }
    if (!Object.keys(changes).some((k) => (STORAGE_KEYS as readonly string[]).includes(k))) {
      return;
    }
    void getRuntimeState().then(callback);
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
