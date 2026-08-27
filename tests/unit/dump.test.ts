import { describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  downloadDump,
  dumpFilename,
  parseDump,
  pickSelectedProfiles,
  serializeDump,
} from '~/lib/dump';
import { createProfile } from '~/lib/profiles';
import type { Profile } from '~/lib/types';

function profileWith(partial: Partial<Profile>): Profile {
  return {
    title: 'Profile 1',
    headers: [],
    respHeaders: [],
    filters: [],
    appendMode: '',
    hideComment: true,
    ...partial,
  };
}

describe('lib/dump — all-profiles dump file', () => {
  it('round-trips a profile list', () => {
    const profiles = [
      createProfile([]),
      profileWith({
        title: 'API',
        headers: [{ enabled: true, name: 'X-Token', value: 'abc', comment: '' }],
        appendMode: 'comma',
      }),
    ];
    const parsed = parseDump(serializeDump(profiles));
    expect(parsed).toEqual(profiles);
  });

  it('pretty-prints so the file is readable', () => {
    const text = serializeDump([profileWith({ title: 'A' })]);
    expect(text).toContain('\n');
    expect(text).toContain('  "title": "A"');
  });

  it('names the file with the calendar date', () => {
    expect(dumpFilename(new Date(2026, 7, 26))).toBe('modheaderx-dump-2026-08-26.json');
  });

  it('converts legacy urlPattern filters on import', () => {
    const text = JSON.stringify([
      {
        title: 'Old',
        filters: [{ enabled: true, type: 'urls', urlPattern: '*://a.com/*' }],
      },
    ]);
    const parsed = parseDump(text);
    const filter = parsed?.[0]?.filters[0];
    expect(filter?.type).toBe('urls');
    if (filter?.type === 'urls') {
      expect(filter.urlRegex).toBe('.*:\\/\\/a\\.com\\/.*');
      expect(filter.urlPattern).toBeUndefined();
    }
  });

  it('reads compact cloud-backup payloads', () => {
    const profiles = [profileWith({ title: 'Synced' })];
    expect(parseDump(JSON.stringify(profiles))?.[0]?.title).toBe('Synced');
  });

  it('returns null for invalid, empty, or single-profile payloads', () => {
    expect(parseDump('this is not json')).toBeNull();
    expect(parseDump('[]')).toBeNull();
    expect(parseDump(JSON.stringify({ title: 'One profile' }))).toBeNull();
    expect(parseDump(JSON.stringify([null]))).toBeNull();
    expect(parseDump(JSON.stringify(['nope', profileWith({})]))).toBeNull();
  });

  it('fills missing optional fields with defaults', () => {
    const parsed = parseDump(JSON.stringify([{ title: 'Sparse' }]));
    expect(parsed).toHaveLength(1);
    expect(parsed![0]).toMatchObject({
      title: 'Sparse',
      appendMode: '',
      hideComment: true,
      filters: [],
    });
    expect(parsed![0]!.headers).toHaveLength(1);
    expect(parsed![0]!.respHeaders).toHaveLength(1);
  });

  it('keeps only checked profiles', () => {
    const profiles = [
      profileWith({ title: 'A' }),
      profileWith({ title: 'B' }),
      profileWith({ title: 'C' }),
    ];
    expect(pickSelectedProfiles(profiles, [true, false, true]).map((p) => p.title)).toEqual([
      'A',
      'C',
    ]);
    expect(pickSelectedProfiles(profiles, [false, false, false])).toEqual([]);
    expect(pickSelectedProfiles(profiles, [true]).map((p) => p.title)).toEqual(['A']);
  });

  it('queues a named JSON download and keeps the blob until accepted', async () => {
    const download = vi.fn(async () => 1);
    fakeBrowser.downloads.download = download;
    await downloadDump(
      [profileWith({ title: 'A' })],
      new Date(2026, 7, 26),
    );
    expect(download).toHaveBeenCalledOnce();
    expect(download).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'modheaderx-dump-2026-08-26.json',
        conflictAction: 'uniquify',
        url: expect.stringMatching(/^data:application\/json;charset=utf-8,/),
      }),
    );
  });
});
