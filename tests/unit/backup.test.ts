import { describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { listBackups, saveBackup, saveBackupIfChanged } from '~/lib/backup';
import { BACKUP_CHUNK_MAX_BYTES, MAX_BACKUP_SNAPSHOTS } from '~/lib/constants';
import { createProfile } from '~/lib/profiles';
import type { Profile } from '~/lib/types';

function bigProfile(size: number): Profile {
  const profile = createProfile([]);
  profile.headers[0] = {
    enabled: true,
    name: 'X-Big',
    value: 'x'.repeat(size),
  };
  return profile;
}

describe('lib/backup — chunked chrome.storage.sync snapshots (data-model.md CloudBackup)', () => {
  it('round-trips a small profile set (single chunk)', async () => {
    const profiles = [createProfile([])];
    await saveBackup(profiles, 1000);
    const backups = await listBackups();
    expect(backups).toHaveLength(1);
    expect(backups[0]!.timeInMs).toBe(1000);
    expect(backups[0]!.profiles).toEqual(profiles);
  });

  it('chunks payloads larger than the 8KB item quota and reassembles them', async () => {
    const profiles = [bigProfile(20000)]; // serialized >> 8KB
    await saveBackup(profiles, 2000);

    const items = await fakeBrowser.storage.sync.get(null);
    const meta = items['backup:2000:meta'] as { chunks: number } | undefined;
    expect(meta).toBeDefined();
    expect(meta!.chunks).toBeGreaterThan(1);
    for (let i = 0; i < meta!.chunks; i++) {
      const chunk = items[`backup:2000:${i}`] as string;
      expect(typeof chunk).toBe('string');
      // Every chunk stays within the 7KB slice budget (4 bytes/char worst case).
      expect(chunk.length * 4).toBeLessThanOrEqual(BACKUP_CHUNK_MAX_BYTES * 4);
    }

    const backups = await listBackups();
    expect(backups).toHaveLength(1);
    expect(backups[0]!.profiles).toEqual(profiles);
  });

  it('reads legacy single-item snapshots (key = ms timestamp, value = string)', async () => {
    const profiles = [createProfile([])];
    await fakeBrowser.storage.sync.set({
      '1700000000000': JSON.stringify(profiles),
    });
    const backups = await listBackups();
    expect(backups).toHaveLength(1);
    expect(backups[0]!.timeInMs).toBe(1700000000000);
    expect(backups[0]!.profiles).toEqual(profiles);
  });

  it('converts legacy urlPattern filters when reading snapshots', async () => {
    const legacy = [
      {
        title: 'Old',
        headers: [],
        respHeaders: [],
        appendMode: '',
        filters: [{ enabled: true, type: 'urls', urlPattern: '*://a.com/*' }],
      },
    ];
    await fakeBrowser.storage.sync.set({ '1700000000001': JSON.stringify(legacy) });
    const backups = await listBackups();
    const filter = backups[0]!.profiles[0]!.filters[0]!;
    expect(filter.type).toBe('urls');
    if (filter.type === 'urls') {
      expect(filter.urlRegex).toBe('.*:\\/\\/a\\.com\\/.*');
      expect(filter.urlPattern).toBeUndefined();
    }
  });

  it('skips snapshots that fail to parse, never fatally', async () => {
    await fakeBrowser.storage.sync.set({
      '1700000000002': 'not json{{{',
      '1700000000003': JSON.stringify({ not: 'an array' }),
      '1700000000004': JSON.stringify([createProfile([])]),
    });
    const backups = await listBackups();
    expect(backups).toHaveLength(1);
    expect(backups[0]!.timeInMs).toBe(1700000000004);
  });

  it('skips chunked snapshots with missing chunks', async () => {
    await fakeBrowser.storage.sync.set({
      'backup:3000:meta': { chunks: 2, createdAt: 'x' },
      'backup:3000:0': JSON.stringify([createProfile([])]),
      // chunk 1 missing
    });
    expect(await listBackups()).toEqual([]);
  });

  it('sorts snapshots newest first', async () => {
    await fakeBrowser.storage.sync.set({
      '100': JSON.stringify([]),
      '300': JSON.stringify([]),
      '200': JSON.stringify([]),
    });
    const backups = await listBackups();
    expect(backups.map((b) => b.timeInMs)).toEqual([300, 200, 100]);
  });

  it('retains only the newest 50 snapshots (legacy + chunked)', async () => {
    const legacyItems: Record<string, string> = {};
    for (let ts = 1; ts <= MAX_BACKUP_SNAPSHOTS; ts++) {
      legacyItems[String(ts)] = JSON.stringify([]);
    }
    await fakeBrowser.storage.sync.set(legacyItems);
    await saveBackup([], 9999); // 51st snapshot

    const backups = await listBackups();
    expect(backups).toHaveLength(MAX_BACKUP_SNAPSHOTS);
    expect(backups[0]!.timeInMs).toBe(9999);
    // Oldest (ts=1) was evicted.
    expect(backups.some((b) => b.timeInMs === 1)).toBe(false);
    const items = await fakeBrowser.storage.sync.get(null);
    expect(items['1']).toBeUndefined();
  });

  it('surfaces quota/write failures to the caller (FR-014)', async () => {
    const setSpy = vi
      .spyOn(fakeBrowser.storage.sync, 'set')
      .mockRejectedValue(new Error('QUOTA_BYTES quota exceeded'));
    await expect(saveBackup([createProfile([])], 4000)).rejects.toThrow(
      'QUOTA_BYTES quota exceeded',
    );
    setSpy.mockRestore();
  });

  it('saveBackupIfChanged skips unchanged profiles and writes on change (FR-002)', async () => {
    const profiles = [createProfile([])];
    expect(await saveBackupIfChanged(profiles)).toBe(true);
    expect(await saveBackupIfChanged(profiles)).toBe(false);
    expect(await listBackups()).toHaveLength(1);

    const changed = [createProfile([])];
    changed[0]!.title = 'Renamed';
    expect(await saveBackupIfChanged(changed)).toBe(true);
    expect(await listBackups()).toHaveLength(2);
  });
});
