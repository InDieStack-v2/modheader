import { browser } from 'wxt/browser';
import { BACKUP_CHUNK_MAX_BYTES, MAX_BACKUP_SNAPSHOTS } from './constants';
import { fixLegacyProfile } from './profiles';
import type { CloudBackup, Profile } from './types';

/**
 * Chunked chrome.storage.sync cloud backup/restore (T026, FR-014) per
 * data-model.md "CloudBackup":
 * - New chunked format: manifest item `backup:<ts>:meta` = { chunks, createdAt },
 *   chunk items `backup:<ts>:<i>` hold string slices ≤ 7 KB.
 * - Legacy format (must remain readable): key `"<ms timestamp>"`, value =
 *   serialized Profile[] string.
 * - Retention: newest 50 snapshots. Unparseable snapshots are skipped, never fatal.
 * - Write failures (quota) are surfaced by rejecting (callers show a toast).
 */

export interface BackupSnapshot {
  timeInMs: number;
  profiles: Profile[];
}

/**
 * Chars per chunk: every UTF-16 code unit encodes to ≤ 4 UTF-8 bytes
 * (a surrogate pair is 2 code units = 4 bytes), so CHUNK_CHARS code units can
 * never exceed BACKUP_CHUNK_MAX_BYTES bytes.
 */
const CHUNK_CHARS = Math.floor(BACKUP_CHUNK_MAX_BYTES / 4);

const LEGACY_KEY_RE = /^\d+$/;
const META_KEY_RE = /^backup:(\d+):meta$/;

function metaKey(ts: number): string {
  return `backup:${ts}:meta`;
}
function chunkKey(ts: number, i: number): string {
  return `backup:${ts}:${i}`;
}

function parseProfiles(value: unknown): Profile[] | null {
  try {
    if (typeof value !== 'string') {
      return null;
    }
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return null;
    }
    for (const profile of parsed as Profile[]) {
      fixLegacyProfile(profile);
    }
    return parsed as Profile[];
  } catch {
    return null; // legacy behavior: skip invalid snapshots
  }
}

/** All snapshot timestamps present (legacy keys + chunked meta keys), ascending. */
function snapshotIds(keys: string[]): number[] {
  const ids = new Set<number>();
  for (const key of keys) {
    if (LEGACY_KEY_RE.test(key)) {
      ids.add(Number(key));
    } else {
      const match = META_KEY_RE.exec(key);
      if (match) {
        ids.add(Number(match[1]));
      }
    }
  }
  return [...ids].sort((a, b) => a - b);
}

async function enforceRetention(): Promise<void> {
  const items = await browser.storage.sync.get(null);
  const ids = snapshotIds(Object.keys(items));
  if (ids.length <= MAX_BACKUP_SNAPSHOTS) {
    return;
  }
  const toRemove = ids.slice(0, ids.length - MAX_BACKUP_SNAPSHOTS);
  const keys: string[] = [];
  for (const ts of toRemove) {
    const meta = items[metaKey(ts)] as CloudBackup | undefined;
    if (meta && typeof meta.chunks === 'number') {
      keys.push(metaKey(ts));
      for (let i = 0; i < meta.chunks; i++) {
        keys.push(chunkKey(ts, i));
      }
    } else {
      keys.push(String(ts)); // legacy single-item snapshot
    }
  }
  await browser.storage.sync.remove(keys);
}

/**
 * Serialize profiles and write as a chunked snapshot. Rejects on storage
 * errors (e.g. sync quota) so callers can surface the failure (FR-014).
 */
export async function saveBackup(
  profiles: Profile[],
  now: number = Date.now(),
): Promise<void> {
  const serialized = JSON.stringify(profiles);
  const chunks: string[] = [];
  for (let i = 0; i < serialized.length; i += CHUNK_CHARS) {
    chunks.push(serialized.slice(i, i + CHUNK_CHARS));
  }
  if (chunks.length === 0) {
    chunks.push('');
  }
  const items: Record<string, unknown> = {
    [metaKey(now)]: {
      chunks: chunks.length,
      createdAt: new Date(now).toISOString(),
    } satisfies CloudBackup,
  };
  chunks.forEach((chunk, i) => {
    items[chunkKey(now, i)] = chunk;
  });
  await browser.storage.sync.set(items);
  await enforceRetention();
}

/** Read all snapshots (legacy + chunked), newest first; invalid ones skipped. */
export async function listBackups(): Promise<BackupSnapshot[]> {
  const items = await browser.storage.sync.get(null);
  const snapshots: BackupSnapshot[] = [];

  for (const [key, value] of Object.entries(items)) {
    if (LEGACY_KEY_RE.test(key)) {
      const profiles = parseProfiles(value);
      if (profiles) {
        snapshots.push({ timeInMs: Number(key), profiles });
      }
      continue;
    }
    const match = META_KEY_RE.exec(key);
    if (match) {
      const ts = Number(match[1]);
      const meta = value as CloudBackup | undefined;
      if (!meta || typeof meta.chunks !== 'number') {
        continue;
      }
      let serialized = '';
      let complete = true;
      for (let i = 0; i < meta.chunks; i++) {
        const chunk = items[chunkKey(ts, i)];
        if (typeof chunk !== 'string') {
          complete = false;
          break;
        }
        serialized += chunk;
      }
      if (!complete) {
        continue;
      }
      const profiles = parseProfiles(serialized);
      if (profiles) {
        snapshots.push({ timeInMs: ts, profiles });
      }
    }
  }

  snapshots.sort((a, b) => b.timeInMs - a.timeInMs);
  return snapshots;
}


/**
 * Auto-backup on profile change (FR-002 parity with legacy
 * saveStorageToCloud, src/background.js:265-280): writes a snapshot only when
 * the serialized profiles differ from the newest existing snapshot, so
 * save-on-change keystrokes don't spam snapshots.
 *
 * @returns true when a new snapshot was written.
 */
export async function saveBackupIfChanged(profiles: Profile[]): Promise<boolean> {
  const [latest] = await listBackups();
  if (latest && JSON.stringify(latest.profiles) === JSON.stringify(profiles)) {
    return false;
  }
  await saveBackup(profiles);
  return true;
}
