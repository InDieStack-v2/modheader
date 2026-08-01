import { browser } from 'wxt/browser';
import { fixLegacyProfile } from './profiles';
import type { Profile } from './types';

/**
 * One-time migration of legacy (ModHeader 2.3.2) localStorage data into
 * chrome.storage.local (T038, FR-003) per research D5 and data-model.md.
 *
 * Legacy keys: `profiles` (JSON Profile[]), `selectedProfile` (index string),
 * `isPaused` ('true'), `lockedTabId` (tab id string). Legacy keys are left in
 * place (read-only safety net).
 *
 * Split per Google's documented MV3 localStorage-migration pattern: the
 * extension page (offscreen document / fallback tab) only READS localStorage
 * (`collectLegacyState`) and messages the payload to the service worker,
 * which owns all storage writes (`applyMigratedState`) — chrome.storage is
 * unreliable inside offscreen documents on real Chrome. Firefox MV3 event
 * pages migrate directly via the composed `migrateLegacyLocalStorage`.
 */

export interface LegacyStorageLike {
  getItem(key: string): string | null;
}

function emptyHeaderRow() {
  // Legacy addHeader creates an enabled empty row.
  return { enabled: true, name: '', value: '', comment: '' };
}

/** Port of the legacy load-path defaults (src/scripts/main.js:166-184). */
function normalizeLegacyProfile(profile: Profile, index: number): void {
  fixLegacyProfile(profile);
  if (!profile.title) {
    profile.title = `Profile ${index + 1}`;
  }
  if (!profile.headers) {
    profile.headers = [emptyHeaderRow()];
  }
  if (!profile.respHeaders) {
    profile.respHeaders = [emptyHeaderRow()];
  }
  if (!profile.filters) {
    profile.filters = [];
  }
  // Legacy appendMode values: '' (override), 'true'/true (concat), 'comma'.
  const mode = profile.appendMode as unknown;
  if (mode === true || mode === 'true') {
    profile.appendMode = 'append';
  } else if (mode !== 'comma' && mode !== 'append') {
    profile.appendMode = '';
  }
}

/**
 * Pure: read the legacy localStorage keys and return the normalized
 * `storage.local` writes (without `migrationDone`). Returns null when no
 * localStorage is available in this context (e.g. a Chrome service worker).
 */
export function collectLegacyState(
  legacyStorage?: LegacyStorageLike,
): Record<string, unknown> | null {
  const legacy =
    legacyStorage ??
    (typeof localStorage === 'undefined' ? undefined : localStorage);
  if (!legacy) {
    return null;
  }

  const writes: Record<string, unknown> = {};

  const serialized = legacy.getItem('profiles');
  if (serialized) {
    try {
      const profiles: unknown = JSON.parse(serialized);
      if (Array.isArray(profiles)) {
        (profiles as Profile[]).forEach((profile, index) =>
          normalizeLegacyProfile(profile, index),
        );
        writes.profiles = profiles;
      }
    } catch {
      // Corrupt legacy data: leave it untouched, never fail the migration.
    }
  }

  const selected = legacy.getItem('selectedProfile');
  writes.selectedProfileIndex =
    selected != null && !Number.isNaN(Number(selected)) ? Number(selected) : 0;

  if (legacy.getItem('isPaused')) {
    writes.isPaused = true;
  }
  const lockedTabId = legacy.getItem('lockedTabId');
  if (lockedTabId != null && lockedTabId !== '') {
    writes.lockedTabId = Number(lockedTabId);
  }

  return writes;
}

/**
 * Write previously collected migration writes plus `migrationDone` to
 * storage.local. Idempotent: returns false without writing when migration
 * already ran.
 */
export async function applyMigratedState(
  writes: Record<string, unknown>,
): Promise<boolean> {
  const { migrationDone } = await browser.storage.local.get('migrationDone');
  if (migrationDone) {
    return false;
  }
  await browser.storage.local.set({ ...writes, migrationDone: true });
  return true;
}

/**
 * Composed collect + apply for DOM-document backgrounds (Firefox MV3 event
 * page). Same external behavior as the original single-step migration.
 *
 * @returns true when the migration ran, false when already done or when no
 *   localStorage is available in this context.
 */
export async function migrateLegacyLocalStorage(
  legacyStorage?: LegacyStorageLike,
): Promise<boolean> {
  const writes = collectLegacyState(legacyStorage);
  if (writes === null) {
    return false;
  }
  return applyMigratedState(writes);
}
