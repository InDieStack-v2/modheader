import { describe, expect, it } from 'vitest';
import {
  appendOrUpdateEntry,
  appendWsMessages,
  bindSocketHook,
  clearEntries,
  clearSockets,
  ensureSlots,
  dropAt,
  getRequestLogState,
  insertSlot,
  isSessionStoreAvailable,
  mergeLogEntry,
  remapOnReorder,
  setRecording,
  setTypeFilter,
  setWsRecording,
  anyRecording,
  stopAllRecording,
  subscribeRequestLog,
  syncRecordingWithPatching,
  upsertSocket,
  wipeLocalFallbackKeys,
} from '~/lib/session-log';
import type { RequestLogEntry, WsConnectionEntry, WsMessage } from '~/lib/types';

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

  it('does not replace a captured text body with a later empty body', () => {
    const prev = entry('a', {
      requestBody: { kind: 'text', text: '{"hello":"world"}' },
      responseBody: { kind: 'text', text: '{"url":"/echo"}' },
    });
    const next = entry('a', {
      requestBody: { kind: 'empty' },
      responseBody: { kind: 'unavailable' },
    });
    const merged = mergeLogEntry(prev, next);
    expect(merged.requestBody).toEqual({
      kind: 'text',
      text: '{"hello":"world"}',
    });
    expect(merged.responseBody).toEqual({ kind: 'text', text: '{"url":"/echo"}' });
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

function socket(id: string, extra?: Partial<WsConnectionEntry>): WsConnectionEntry {
  return {
    id,
    profileIndex: 0,
    tabId: 1,
    startedAt: 1,
    url: 'wss://example.com/ws',
    state: 'connecting',
    requestHeaders: [],
    messagesObserved: false,
    messages: [],
    droppedMessages: false,
    ...extra,
  };
}

function msg(seq: number, extra?: Partial<WsMessage>): WsMessage {
  return {
    seq,
    at: seq,
    dir: 'received',
    kind: 'text',
    data: `m${seq}`,
    size: 2,
    ...extra,
  };
}

describe('session-log sockets (spec 006)', () => {
  it('defaults sockets to [] and keeps them in step through slot ops', async () => {
    expect((await getRequestLogState()).sockets).toEqual([]);
    await ensureSlots(2);
    expect((await getRequestLogState()).sockets).toEqual([[], []]);
    await upsertSocket(0, socket('s0'));
    await upsertSocket(1, socket('s1'));
    await remapOnReorder(0, 1);
    let state = await getRequestLogState();
    expect(state.sockets[0]![0]!.id).toBe('s1');
    expect(state.sockets[1]![0]!.id).toBe('s0');
    await dropAt(0);
    await insertSlot(0);
    state = await getRequestLogState();
    expect(state.sockets[0]).toEqual([]);
    expect(state.sockets[1]![0]!.id).toBe('s0');
  });

  it('wipeLocalFallbackKeys also clears sockets when session is unavailable', async () => {
    await upsertSocket(0, socket('s'));
    await wipeLocalFallbackKeys();
    const state = await getRequestLogState();
    expect(state.sockets).toEqual(isSessionStoreAvailable() ? [[socket('s')]] : []);
  });

  it('subscribeRequestLog fires when only sockets change', async () => {
    const seen: number[] = [];
    const off = subscribeRequestLog((state) => {
      seen.push(state.sockets[0]?.length ?? 0);
    });
    await upsertSocket(0, socket('s'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    off();
    expect(seen).toContain(1);
  });

  it('upsertSocket merges by id with state precedence', async () => {
    await upsertSocket(0, socket('a'));
    await upsertSocket(0, socket('a', { state: 'open', requestHeaders: [{ name: 'X', value: '1' }] }));
    await upsertSocket(0, socket('a', { state: 'connecting' }));
    let row = (await getRequestLogState()).sockets[0]![0]!;
    expect(row.state).toBe('open');
    expect(row.requestHeaders).toEqual([{ name: 'X', value: '1' }]);
    await upsertSocket(0, socket('a', { state: 'failed' }));
    row = (await getRequestLogState()).sockets[0]![0]!;
    expect(row.state).toBe('open');
    await upsertSocket(0, socket('a', { state: 'closed', closeCode: 4001, closeReason: 'bye' }));
    row = (await getRequestLogState()).sockets[0]![0]!;
    expect(row).toMatchObject({ state: 'closed', closeCode: 4001, closeReason: 'bye' });
    await upsertSocket(0, socket('b'));
    await upsertSocket(0, socket('b', { state: 'failed' }));
    const state = await getRequestLogState();
    expect(state.sockets[0]!.map((s) => s.id)).toEqual(['b', 'a']);
    expect(state.sockets[0]![0]!.state).toBe('failed');
  });

  it('caps connections at 50, newest first', async () => {
    for (let i = 0; i < 53; i++) {
      await upsertSocket(0, socket(`s${i}`));
    }
    const list = (await getRequestLogState()).sockets[0]!;
    expect(list).toHaveLength(50);
    expect(list[0]!.id).toBe('s52');
  });

  it('bindSocketHook marks observed; appendWsMessages sorts by seq and caps at 500', async () => {
    await upsertSocket(0, socket('a'));
    await bindSocketHook(0, 'a', '1:0:1');
    await appendWsMessages(0, '1:0:1', [msg(2), msg(1)]);
    let row = (await getRequestLogState()).sockets[0]![0]!;
    expect(row).toMatchObject({ hookKey: '1:0:1', messagesObserved: true, state: 'open' });
    expect(row.messages.map((m) => m.seq)).toEqual([1, 2]);
    expect(row.droppedMessages).toBe(false);
    await appendWsMessages(0, '1:0:1', Array.from({ length: 505 }, (_, i) => msg(i + 3)));
    row = (await getRequestLogState()).sockets[0]![0]!;
    expect(row.messages).toHaveLength(500);
    expect(row.messages[0]!.seq).toBe(8);
    expect(row.droppedMessages).toBe(true);
  });

  it('appendWsMessages to an unknown hookKey is a no-op', async () => {
    await upsertSocket(0, socket('a'));
    await appendWsMessages(0, 'nope', [msg(1)]);
    expect((await getRequestLogState()).sockets[0]![0]!.messages).toEqual([]);
  });

  it('trims oldest messages of the oldest connection past the 2 MB budget', async () => {
    const big = 'x'.repeat(60_000);
    await upsertSocket(0, socket('old'));
    await bindSocketHook(0, 'old', 'k-old');
    await upsertSocket(0, socket('new'));
    await bindSocketHook(0, 'new', 'k-new');
    await appendWsMessages(0, 'k-new', Array.from({ length: 5 }, (_, i) => msg(i, { data: big })));
    await appendWsMessages(0, 'k-old', Array.from({ length: 40 }, (_, i) => msg(i, { data: big })));
    const [newer, older] = (await getRequestLogState()).sockets[0]!;
    expect(JSON.stringify([newer, older]).length).toBeLessThanOrEqual(2 * 1024 * 1024);
    expect(newer!.messages).toHaveLength(5);
    expect(newer!.droppedMessages).toBe(false);
    expect(older!.droppedMessages).toBe(true);
    expect(older!.messages.at(-1)!.seq).toBe(39);
  });

  it('clearSockets leaves entries, recording, typeFilter; clearEntries leaves sockets', async () => {
    await setRecording(0, true);
    await setTypeFilter(0, ['script']);
    await appendOrUpdateEntry(0, entry('http'));
    await upsertSocket(0, socket('ws'));
    await clearSockets(0);
    let state = await getRequestLogState();
    expect(state.sockets[0]).toEqual([]);
    expect(state.entries[0]![0]!.id).toBe('http');
    expect(state.recording[0]).toBe(true);
    expect(state.typeFilter[0]).toEqual(['script']);
    await upsertSocket(0, socket('ws'));
    await clearEntries(0);
    state = await getRequestLogState();
    expect(state.sockets[0]![0]!.id).toBe('ws');
  });
});

describe('independent WebSocket recording (spec 006 FR-008)', () => {
  it('wsRecording defaults off and is independent of recording', async () => {
    expect((await getRequestLogState()).wsRecording).toEqual([]);
    await setWsRecording(0, true);
    let state = await getRequestLogState();
    expect(state.wsRecording[0]).toBe(true);
    expect(state.recording[0] ?? false).toBe(false);
    await setRecording(0, true);
    await setWsRecording(0, false);
    state = await getRequestLogState();
    expect(state.recording[0]).toBe(true);
    expect(state.wsRecording[0]).toBe(false);
  });

  it('anyRecording is true when either flag is on', async () => {
    await setWsRecording(0, true);
    expect(anyRecording(await getRequestLogState())).toBe(true);
    await setWsRecording(0, false);
    expect(anyRecording(await getRequestLogState())).toBe(false);
    await setRecording(1, true);
    expect(anyRecording(await getRequestLogState())).toBe(true);
  });

  it('wsRecording follows slot reorder, drop and insert', async () => {
    await setWsRecording(0, true);
    await setWsRecording(1, false);
    await remapOnReorder(0, 1);
    let state = await getRequestLogState();
    expect(state.wsRecording).toEqual([false, true]);
    await dropAt(0);
    await insertSlot(0);
    state = await getRequestLogState();
    expect(state.wsRecording).toEqual([false, true]);
  });

  it('clearSockets and clearEntries leave both recording flags alone', async () => {
    await setRecording(0, true);
    await setWsRecording(0, true);
    await clearSockets(0);
    await clearEntries(0);
    const state = await getRequestLogState();
    expect(state.recording[0]).toBe(true);
    expect(state.wsRecording[0]).toBe(true);
  });

  it('pause turns both flags off for every profile; no rules only the selected one', async () => {
    await setRecording(0, true);
    await setWsRecording(0, true);
    await setRecording(1, true);
    await setWsRecording(1, true);
    await syncRecordingWithPatching({ paused: false, selectedIndex: 0, selectedHasRules: false });
    let state = await getRequestLogState();
    expect([state.recording[0], state.wsRecording[0]]).toEqual([false, false]);
    expect([state.recording[1], state.wsRecording[1]]).toEqual([true, true]);
    await syncRecordingWithPatching({ paused: true, selectedIndex: 1, selectedHasRules: true });
    state = await getRequestLogState();
    expect(state.recording).toEqual([false, false]);
    expect(state.wsRecording).toEqual([false, false]);
  });
});
