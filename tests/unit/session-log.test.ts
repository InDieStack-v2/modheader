import { describe, expect, it } from 'vitest';
import {
  appendOrUpdateEntry,
  clearEntries,
  dropAt,
  getRequestLogState,
  insertSlot,
  isSessionStoreAvailable,
  remapOnReorder,
  setRecording,
  setTypeFilter,
  stopAllRecording,
  syncRecordingWithPatching,
  wipeLocalFallbackKeys,
} from '~/lib/session-log';
import type { RequestLogEntry } from '~/lib/types';

function entry(id: string, extra?: Partial<RequestLogEntry>): RequestLogEntry {
  return {
    id,
    profileIndex: 0,
    startedAt: 1,
    method: 'GET',
    url: 'https://example.com/',
    resourceType: 'xmlhttprequest',
    status: 'pending',
    requestHeaders: [],
    ...extra,
  };
}

describe('session-log', () => {
  it('defaults recording off and upserts by id newest-first', async () => {
    const empty = await getRequestLogState();
    expect(empty.recording).toEqual([]);
    await appendOrUpdateEntry(0, entry('a', { startedAt: 2 }));
    await appendOrUpdateEntry(0, entry('b', { startedAt: 3 }));
    await appendOrUpdateEntry(0, entry('a', { status: 200 }));
    const state = await getRequestLogState();
    expect(state.recording[0]).toBe(false);
    expect(state.entries[0]!.map((e) => e.id)).toEqual(['b', 'a']);
    expect(state.entries[0]!.find((e) => e.id === 'a')!.status).toBe(200);
  });

  it('caps at 200 entries', async () => {
    for (let i = 0; i < 205; i++) {
      await appendOrUpdateEntry(0, entry(`id-${i}`));
    }
    const state = await getRequestLogState();
    expect(state.entries[0]).toHaveLength(200);
    expect(state.entries[0]![0]!.id).toBe('id-204');
  });

  it('setRecording and clearEntries leave recording', async () => {
    await setRecording(0, true);
    await appendOrUpdateEntry(0, entry('a'));
    await clearEntries(0);
    const state = await getRequestLogState();
    expect(state.recording[0]).toBe(true);
    expect(state.entries[0]).toEqual([]);
  });

  it('remapOnReorder moves slots together', async () => {
    await setRecording(0, true);
    await setRecording(1, false);
    await appendOrUpdateEntry(0, entry('p0'));
    await appendOrUpdateEntry(1, entry('p1'));
    await remapOnReorder(0, 1);
    const state = await getRequestLogState();
    expect(state.recording).toEqual([false, true]);
    expect(state.entries[0]![0]!.id).toBe('p1');
    expect(state.entries[1]![0]!.id).toBe('p0');
  });

  it('dropAt shifts neighbors; insertSlot restores an empty slot', async () => {
    await setRecording(0, true);
    await setRecording(1, true);
    await appendOrUpdateEntry(0, entry('p0'));
    await appendOrUpdateEntry(1, entry('p1'));
    await dropAt(0);
    let state = await getRequestLogState();
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0]![0]!.id).toBe('p1');
    await insertSlot(0);
    state = await getRequestLogState();
    expect(state.recording[0]).toBe(false);
    expect(state.entries[0]).toEqual([]);
    expect(state.entries[1]![0]!.id).toBe('p1');
  });

  it('typeFilter remaps, inserts empty, and clears with the log', async () => {
    await setTypeFilter(0, ['xmlhttprequest']);
    await setTypeFilter(1, ['script']);
    await remapOnReorder(0, 1);
    let state = await getRequestLogState();
    expect(state.typeFilter[0]).toEqual(['script']);
    expect(state.typeFilter[1]).toEqual(['xmlhttprequest']);
    await dropAt(0);
    await insertSlot(0);
    state = await getRequestLogState();
    expect(state.typeFilter[0]).toEqual([]);
    expect(state.typeFilter[1]).toEqual(['xmlhttprequest']);
    await appendOrUpdateEntry(1, entry('keep'));
    await clearEntries(1);
    state = await getRequestLogState();
    expect(state.typeFilter[1]).toEqual([]);
  });

  it('wipeLocalFallbackKeys clears local keys when session is unavailable', async () => {
    await appendOrUpdateEntry(0, entry('a'));
    await wipeLocalFallbackKeys();
    const state = await getRequestLogState();
    if (isSessionStoreAvailable()) {
      expect(state.entries[0]![0]!.id).toBe('a');
    } else {
      expect(state.entries).toEqual([]);
    }
  });

  it('does not let a late pending write overwrite a final status', async () => {
    await appendOrUpdateEntry(0, entry('race', { status: 'pending' }));
    await appendOrUpdateEntry(0, entry('race', { status: 200 }));
    await appendOrUpdateEntry(0, entry('race', { status: 'pending' }));
    const state = await getRequestLogState();
    expect(state.entries[0]!.find((row) => row.id === 'race')!.status).toBe(200);
  });

  it('stopAllRecording turns every flag off and keeps entries', async () => {
    await setRecording(0, true);
    await setRecording(1, true);
    await appendOrUpdateEntry(0, entry('keep'));
    await stopAllRecording();
    const state = await getRequestLogState();
    expect(state.recording).toEqual([false, false]);
    expect(state.entries[0]![0]!.id).toBe('keep');
  });

  it('syncRecordingWithPatching unifies pause and no-rules as recording off', async () => {
    await setRecording(0, true);
    await setRecording(1, true);
    await appendOrUpdateEntry(0, entry('keep'));
    await syncRecordingWithPatching({
      paused: true,
      selectedIndex: 0,
      selectedHasRules: true,
    });
    let state = await getRequestLogState();
    expect(state.recording).toEqual([false, false]);
    expect(state.entries[0]![0]!.id).toBe('keep');

    await setRecording(0, true);
    await setRecording(1, true);
    await syncRecordingWithPatching({
      paused: false,
      selectedIndex: 0,
      selectedHasRules: false,
    });
    state = await getRequestLogState();
    expect(state.recording[0]).toBe(false);
    expect(state.recording[1]).toBe(true);
  });
});
