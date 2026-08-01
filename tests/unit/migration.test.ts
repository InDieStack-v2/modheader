import { describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  applyMigratedState,
  collectLegacyState,
  migrateLegacyLocalStorage,
  type LegacyStorageLike,
} from '~/lib/migration';
import type { RuntimeState } from '~/lib/types';

/** Minimal localStorage stand-in backed by a plain object. */
function fakeLegacyStorage(data: Record<string, string>): LegacyStorageLike {
  return { getItem: (key: string) => (key in data ? data[key]! : null) };
}

async function getLocal(keys: string[]): Promise<Record<string, unknown>> {
  return fakeBrowser.storage.local.get(keys);
}

const LEGACY_PROFILE = {
  title: 'Legacy 1',
  hideComment: true,
  headers: [
    { enabled: true, name: 'X-Req', value: 'a', comment: 'keep me' },
    { enabled: false, name: 'X-Off', value: 'b' },
  ],
  respHeaders: [{ enabled: true, name: 'X-Resp', value: 'c' }],
  filters: [{ enabled: true, type: 'urls', urlPattern: '*://a.com/*' }],
  appendMode: 'comma',
};

const FULL_LEGACY = {
  profiles: JSON.stringify([LEGACY_PROFILE, { title: 'Legacy 2' }]),
  selectedProfile: '1',
  isPaused: 'true',
  lockedTabId: '123',
};

describe('collectLegacyState — pure legacy localStorage read (US3)', () => {
  it('collects a full 2.3.2 fixture with zero data loss, without migrationDone', () => {
    const writes = collectLegacyState(fakeLegacyStorage(FULL_LEGACY));
    expect(writes).not.toBeNull();
    expect(writes!.migrationDone).toBeUndefined(); // owned by applyMigratedState
    expect(writes!.selectedProfileIndex).toBe(1);
    expect(writes!.isPaused).toBe(true);
    expect(writes!.lockedTabId).toBe(123);

    const [first, second] = writes!.profiles as RuntimeState['profiles'];
    // Zero data loss: headers, comments, respHeaders, appendMode preserved.
    expect(first!.title).toBe('Legacy 1');
    expect(first!.headers).toEqual(LEGACY_PROFILE.headers);
    expect(first!.respHeaders).toEqual(LEGACY_PROFILE.respHeaders);
    expect(first!.appendMode).toBe('comma');
    // Wildcard filters converted (FR-004 / fixLegacyProfile).
    const filter = first!.filters[0]!;
    expect(filter.type).toBe('urls');
    if (filter.type === 'urls') {
      expect(filter.urlRegex).toBe('.*:\\/\\/a\\.com\\/.*');
      expect(filter.urlPattern).toBeUndefined();
    }
    // Legacy load-path defaults fill missing fields.
    expect(second!.headers).toHaveLength(1);
    expect(second!.respHeaders).toHaveLength(1);
    expect(second!.filters).toEqual([]);
    expect(second!.appendMode).toBe('');
  });

  it('normalizes legacy appendMode "true" to "append"', () => {
    const profile = { ...LEGACY_PROFILE, appendMode: 'true' };
    const writes = collectLegacyState(
      fakeLegacyStorage({ profiles: JSON.stringify([profile]) }),
    );
    const profiles = writes!.profiles as RuntimeState['profiles'];
    expect(profiles[0]!.appendMode).toBe('append');
  });

  it('collects only defaults when there is no legacy data', () => {
    const writes = collectLegacyState(fakeLegacyStorage({}));
    expect(writes).toEqual({ selectedProfileIndex: 0 });
  });

  it('survives corrupt legacy profiles JSON (never fatal)', () => {
    const writes = collectLegacyState(
      fakeLegacyStorage({ profiles: '{corrupt json' }),
    );
    expect(writes).not.toBeNull();
    expect(writes!.profiles).toBeUndefined();
  });

  it('returns null when localStorage is unavailable (e.g. Chrome SW)', () => {
    expect(collectLegacyState(undefined)).toBeNull();
  });
});

describe('applyMigratedState — storage.local writes (US3)', () => {
  it('writes the payload plus migrationDone', async () => {
    const writes = collectLegacyState(fakeLegacyStorage(FULL_LEGACY))!;
    const ran = await applyMigratedState(writes);
    expect(ran).toBe(true);

    const state = (await getLocal([
      'profiles',
      'selectedProfileIndex',
      'isPaused',
      'lockedTabId',
      'migrationDone',
    ])) as unknown as RuntimeState;
    expect(state.migrationDone).toBe(true);
    expect(state.selectedProfileIndex).toBe(1);
    expect(state.isPaused).toBe(true);
    expect(state.lockedTabId).toBe(123);
    expect(state.profiles).toHaveLength(2);
    expect(state.profiles[0]!.title).toBe('Legacy 1');
  });

  it('marks done even when the payload has no profiles', async () => {
    const ran = await applyMigratedState(collectLegacyState(fakeLegacyStorage({}))!);
    expect(ran).toBe(true);
    const state = await getLocal(['profiles', 'migrationDone']);
    expect(state.migrationDone).toBe(true);
    expect(state.profiles).toBeUndefined();
  });

  it('is idempotent: a second apply is a no-op', async () => {
    expect(await applyMigratedState({ profiles: [{ title: 'First' }] })).toBe(true);
    expect(await applyMigratedState({ profiles: [{ title: 'Second' }] })).toBe(false);

    const state = (await getLocal(['profiles'])) as unknown as RuntimeState;
    expect(state.profiles).toHaveLength(1);
    expect(state.profiles[0]!.title).toBe('First');
  });
});

describe('migrateLegacyLocalStorage — composed collect + apply (Firefox path)', () => {
  it('runs the full migration end to end', async () => {
    const ran = await migrateLegacyLocalStorage(fakeLegacyStorage(FULL_LEGACY));
    expect(ran).toBe(true);
    const state = (await getLocal(['profiles', 'migrationDone'])) as unknown as RuntimeState;
    expect(state.migrationDone).toBe(true);
    expect(state.profiles).toHaveLength(2);
    expect(state.profiles[0]!.title).toBe('Legacy 1');
  });

  it('does not run when localStorage is unavailable (e.g. Chrome SW)', async () => {
    const ran = await migrateLegacyLocalStorage(undefined);
    // No legacy storage passed → nothing to migrate; must not mark done so
    // the offscreen-document path can still perform the migration.
    expect(ran).toBe(false);
    const state = await getLocal(['migrationDone']);
    expect(state.migrationDone).toBeUndefined();
  });
});
