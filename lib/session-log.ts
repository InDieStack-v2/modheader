import { browser } from 'wxt/browser';
import type {
  RequestLogEntry,
  RequestLogState,
  WsConnectionEntry,
  WsConnectionState,
  WsMessage,
} from './types';

export const REQUEST_LOG_RECORDING_KEY = 'requestLogRecording';
export const REQUEST_LOG_ENTRIES_KEY = 'requestLogEntries';
export const REQUEST_LOG_TYPE_FILTER_KEY = 'requestLogTypeFilter';
export const REQUEST_LOG_SOCKETS_KEY = 'requestLogSockets';
export const REQUEST_LOG_WS_RECORDING_KEY = 'requestLogWsRecording';

const MAX_ENTRIES = 200;
/** HTTP entries + socket budget stay under the 10 MB storage.session quota. */
const MAX_BYTES = 7 * 1024 * 1024;
const MAX_SOCKETS = 50;
const MAX_WS_MESSAGES = 500;
const MAX_WS_BYTES = 2 * 1024 * 1024;

type StorageArea = {
  get(
    keys?: string | string[] | Record<string, unknown> | null,
  ): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
};

export function isSessionStoreAvailable(): boolean {
  const session = (browser.storage as { session?: { get?: unknown } }).session;
  return typeof session?.get === 'function';
}

function area(): StorageArea {
  if (isSessionStoreAvailable()) {
    return (browser.storage as { session: StorageArea }).session;
  }
  return browser.storage.local as StorageArea;
}

export async function wipeLocalFallbackKeys(): Promise<void> {
  if (isSessionStoreAvailable()) {
    return;
  }
  await browser.storage.local.remove([
    REQUEST_LOG_RECORDING_KEY,
    REQUEST_LOG_WS_RECORDING_KEY,
    REQUEST_LOG_ENTRIES_KEY,
    REQUEST_LOG_TYPE_FILTER_KEY,
    REQUEST_LOG_SOCKETS_KEY,
  ]);
}

export async function getRequestLogState(): Promise<RequestLogState> {
  const data = await area().get([
    REQUEST_LOG_RECORDING_KEY,
    REQUEST_LOG_WS_RECORDING_KEY,
    REQUEST_LOG_ENTRIES_KEY,
    REQUEST_LOG_TYPE_FILTER_KEY,
    REQUEST_LOG_SOCKETS_KEY,
  ]);
  return {
    recording:
      (data[REQUEST_LOG_RECORDING_KEY] as boolean[] | undefined) ?? [],
    wsRecording:
      (data[REQUEST_LOG_WS_RECORDING_KEY] as boolean[] | undefined) ?? [],
    entries:
      (data[REQUEST_LOG_ENTRIES_KEY] as RequestLogEntry[][] | undefined) ?? [],
    typeFilter:
      (data[REQUEST_LOG_TYPE_FILTER_KEY] as string[][] | undefined) ?? [],
    sockets:
      (data[REQUEST_LOG_SOCKETS_KEY] as WsConnectionEntry[][] | undefined) ??
      [],
  };
}

async function writeState(state: RequestLogState): Promise<void> {
  await area().set({
    [REQUEST_LOG_RECORDING_KEY]: state.recording,
    [REQUEST_LOG_WS_RECORDING_KEY]: state.wsRecording,
    [REQUEST_LOG_ENTRIES_KEY]: state.entries,
    [REQUEST_LOG_TYPE_FILTER_KEY]: state.typeFilter,
  });
}

/** Sockets live under their own key so socket flushes never rewrite HTTP rows. */
async function writeSockets(sockets: WsConnectionEntry[][]): Promise<void> {
  await area().set({ [REQUEST_LOG_SOCKETS_KEY]: sockets });
}

function pad(state: RequestLogState, count: number): RequestLogState {
  const recording = [...state.recording];
  const wsRecording = [...state.wsRecording];
  const entries = state.entries.map((list) => [...list]);
  const typeFilter = state.typeFilter.map((list) => [...list]);
  const sockets = state.sockets.map((list) => [...list]);
  while (recording.length < count) {
    recording.push(false);
  }
  while (wsRecording.length < count) {
    wsRecording.push(false);
  }
  while (entries.length < count) {
    entries.push([]);
  }
  while (typeFilter.length < count) {
    typeFilter.push([]);
  }
  while (sockets.length < count) {
    sockets.push([]);
  }
  return { recording, wsRecording, entries, typeFilter, sockets };
}

export async function ensureSlots(profileCount: number): Promise<void> {
  const next = pad(await getRequestLogState(), profileCount);
  await writeState(next);
  await writeSockets(next.sockets);
}

export async function setRecording(
  profileIndex: number,
  on: boolean,
): Promise<void> {
  const next = pad(await getRequestLogState(), profileIndex + 1);
  next.recording[profileIndex] = on;
  await writeState(next);
}

/** WebSocket capture has its own switch, independent of `recording` (spec 006 FR-008). */
export async function setWsRecording(
  profileIndex: number,
  on: boolean,
): Promise<void> {
  const next = pad(await getRequestLogState(), profileIndex + 1);
  next.wsRecording[profileIndex] = on;
  await writeState(next);
}

export async function stopAllRecording(): Promise<void> {
  const state = await getRequestLogState();
  if (!anyRecording(state)) {
    return;
  }
  await writeState({
    ...state,
    recording: state.recording.map(() => false),
    wsRecording: state.wsRecording.map(() => false),
  });
}

/**
 * Recording is only meaningful while this profile can patch. Global pause or
 * no enabled rules turns recording off (entries stay). Same path for both.
 */
export async function syncRecordingWithPatching(input: {
  paused: boolean;
  selectedIndex: number;
  selectedHasRules: boolean;
}): Promise<void> {
  if (input.paused) {
    await stopAllRecording();
    return;
  }
  if (!input.selectedHasRules) {
    await setRecording(input.selectedIndex, false);
    await setWsRecording(input.selectedIndex, false);
  }
}

function estimatedBytes(state: RequestLogState): number {
  return JSON.stringify(state.entries).length;
}

function capProfile(list: RequestLogEntry[]): RequestLogEntry[] {
  return list.length > MAX_ENTRIES ? list.slice(0, MAX_ENTRIES) : list;
}

function preferBody(
  prev: RequestLogEntry['requestBody'],
  next: RequestLogEntry['requestBody'],
): RequestLogEntry['requestBody'] {
  if (!next || next.kind === 'unavailable') {
    return prev ?? next;
  }
  if (!prev || prev.kind === 'unavailable' || prev.kind === 'empty') {
    return next;
  }
  if (next.kind === 'empty' && (prev.kind === 'text' || prev.kind === 'binary')) {
    return prev;
  }
  return next;
}

export function mergeLogStatus(
  prev: RequestLogEntry['status'],
  next: RequestLogEntry['status'],
): RequestLogEntry['status'] {
  if (next === 'pending' && prev !== 'pending') {
    return prev;
  }
  return next;
}

export function mergeLogEntry(
  prev: RequestLogEntry,
  next: RequestLogEntry,
): RequestLogEntry {
  return {
    ...prev,
    ...next,
    startedAt: Math.min(prev.startedAt, next.startedAt),
    status: mergeLogStatus(prev.status, next.status),
    requestHeaders: next.requestHeaders.length
      ? next.requestHeaders
      : prev.requestHeaders,
    responseHeaders: next.responseHeaders?.length
      ? next.responseHeaders
      : prev.responseHeaders,
    requestBody: preferBody(prev.requestBody, next.requestBody),
    responseBody: preferBody(prev.responseBody, next.responseBody),
  };
}

let writeChain: Promise<void> = Promise.resolve();

export async function appendOrUpdateEntry(
  profileIndex: number,
  entry: RequestLogEntry,
): Promise<void> {
  const run = async () => {
    const next = pad(await getRequestLogState(), profileIndex + 1);
    const list = [...(next.entries[profileIndex] ?? [])];
    const existing = list.findIndex((row) => row.id === entry.id);
    if (existing >= 0) {
      list[existing] = mergeLogEntry(list[existing]!, entry);
    } else {
      list.unshift(entry);
    }
    next.entries[profileIndex] = capProfile(list);
    while (
      estimatedBytes(next) > MAX_BYTES &&
      (next.entries[profileIndex]?.length ?? 0) > 1
    ) {
      next.entries[profileIndex] = next.entries[profileIndex]!.slice(0, -1);
    }
    await writeState(next);
  };
  await queueWrite(run);
}

export async function clearEntries(profileIndex: number): Promise<void> {
  const next = pad(await getRequestLogState(), profileIndex + 1);
  next.entries[profileIndex] = [];
  next.typeFilter[profileIndex] = [];
  await writeState(next);
}

export async function setTypeFilter(
  profileIndex: number,
  types: string[],
): Promise<void> {
  const next = pad(await getRequestLogState(), profileIndex + 1);
  next.typeFilter[profileIndex] = types;
  await writeState(next);
}

export async function remapOnReorder(from: number, to: number): Promise<void> {
  const state = await getRequestLogState();
  const n = Math.max(
    state.recording.length,
    state.wsRecording.length,
    state.entries.length,
    state.typeFilter.length,
    state.sockets.length,
    from + 1,
    to + 1,
  );
  const next = pad(state, n);
  const clamp = (i: number) => Math.max(0, Math.min(n - 1, i));
  const move = <T>(arr: T[]): T[] => {
    const copy = [...arr];
    const [item] = copy.splice(clamp(from), 1);
    copy.splice(clamp(to), 0, item!);
    return copy;
  };
  next.recording = move(next.recording);
  next.wsRecording = move(next.wsRecording);
  next.entries = move(next.entries);
  next.typeFilter = move(next.typeFilter);
  next.sockets = move(next.sockets);
  await writeState(next);
  await writeSockets(next.sockets);
}

export async function dropAt(index: number): Promise<void> {
  const state = await getRequestLogState();
  const next = pad(state, Math.max(state.recording.length, index + 1));
  if (index < 0 || index >= next.recording.length) {
    return;
  }
  next.recording.splice(index, 1);
  next.wsRecording.splice(index, 1);
  next.entries.splice(index, 1);
  next.typeFilter.splice(index, 1);
  next.sockets.splice(index, 1);
  await writeState(next);
  await writeSockets(next.sockets);
}

export async function insertSlot(index: number): Promise<void> {
  const state = await getRequestLogState();
  const n = Math.max(
    state.recording.length,
    state.wsRecording.length,
    state.entries.length,
    state.typeFilter.length,
    state.sockets.length,
  );
  const next = pad(state, n);
  const at = Math.max(0, Math.min(index, next.recording.length));
  next.recording.splice(at, 0, false);
  next.wsRecording.splice(at, 0, false);
  next.entries.splice(at, 0, []);
  next.typeFilter.splice(at, 0, []);
  next.sockets.splice(at, 0, []);
  await writeState(next);
  await writeSockets(next.sockets);
}

const WS_STATE_RANK: Record<WsConnectionState, number> = {
  connecting: 0,
  open: 1,
  closed: 2,
  failed: 2,
};

/** Furthest state wins; `failed` only applies from `connecting`. */
export function mergeWsState(
  prev: WsConnectionState,
  next: WsConnectionState,
): WsConnectionState {
  if (next === 'failed') {
    return prev === 'connecting' ? 'failed' : prev;
  }
  return WS_STATE_RANK[next] > WS_STATE_RANK[prev] ? next : prev;
}

function mergeSocket(
  prev: WsConnectionEntry,
  next: WsConnectionEntry,
): WsConnectionEntry {
  return {
    ...prev,
    ...next,
    startedAt: Math.min(prev.startedAt, next.startedAt),
    state: mergeWsState(prev.state, next.state),
    requestHeaders: next.requestHeaders.length
      ? next.requestHeaders
      : prev.requestHeaders,
    responseHeaders: next.responseHeaders?.length
      ? next.responseHeaders
      : prev.responseHeaders,
    // Messages and hook binding are owned by appendWsMessages/bindSocketHook.
    hookKey: prev.hookKey ?? next.hookKey,
    messagesObserved: prev.messagesObserved || next.messagesObserved,
    messages: prev.messages,
    droppedMessages: prev.droppedMessages || next.droppedMessages,
  };
}

/** Drop the oldest messages of the oldest connection first, then whole connections. */
function trimSockets(list: WsConnectionEntry[]): WsConnectionEntry[] {
  let total = JSON.stringify(list).length;
  const out = list.map((row) => ({ ...row, messages: [...row.messages] }));
  while (total > MAX_WS_BYTES && out.length > 0) {
    const victim = [...out].reverse().find((row) => row.messages.length > 0);
    if (!victim) {
      total -= JSON.stringify(out.pop()).length + 1;
      continue;
    }
    const dropped = victim.messages.shift()!;
    victim.droppedMessages = true;
    total -= JSON.stringify(dropped).length + 1;
  }
  return out;
}

function queueWrite(run: () => Promise<void>): Promise<void> {
  const queued = writeChain.then(run, run);
  writeChain = queued.then(
    () => undefined,
    () => undefined,
  );
  return queued;
}

async function updateSockets(
  profileIndex: number,
  change: (list: WsConnectionEntry[]) => WsConnectionEntry[] | null,
): Promise<void> {
  await queueWrite(async () => {
    const next = pad(await getRequestLogState(), profileIndex + 1);
    const changed = change([...(next.sockets[profileIndex] ?? [])]);
    if (!changed) {
      return;
    }
    next.sockets[profileIndex] = trimSockets(changed);
    await writeSockets(next.sockets);
  });
}

export async function upsertSocket(
  profileIndex: number,
  entry: WsConnectionEntry,
): Promise<void> {
  await updateSockets(profileIndex, (list) => {
    const existing = list.findIndex((row) => row.id === entry.id);
    if (existing >= 0) {
      list[existing] = mergeSocket(list[existing]!, entry);
      return list;
    }
    return [entry, ...list].slice(0, MAX_SOCKETS);
  });
}

export async function bindSocketHook(
  profileIndex: number,
  entryId: string,
  hookKey: string,
): Promise<void> {
  await updateSockets(profileIndex, (list) => {
    const at = list.findIndex((row) => row.id === entryId);
    if (at < 0) {
      return null;
    }
    const row = list[at]!;
    list[at] = {
      ...row,
      hookKey,
      messagesObserved: true,
      state: mergeWsState(row.state, 'open'),
    };
    return list;
  });
}

export async function appendWsMessages(
  profileIndex: number,
  hookKey: string,
  messages: WsMessage[],
): Promise<void> {
  await updateSockets(profileIndex, (list) => {
    const at = list.findIndex((row) => row.hookKey === hookKey);
    if (at < 0 || messages.length === 0) {
      return null;
    }
    const row = list[at]!;
    const merged = [...row.messages, ...messages].sort((a, b) => a.seq - b.seq);
    const kept = merged.slice(-MAX_WS_MESSAGES);
    list[at] = {
      ...row,
      messages: kept,
      droppedMessages: row.droppedMessages || kept.length < merged.length,
    };
    return list;
  });
}

export async function clearSockets(profileIndex: number): Promise<void> {
  await updateSockets(profileIndex, () => []);
}

export function subscribeRequestLog(
  callback: (state: RequestLogState) => void,
): () => void {
  const listener = (
    changes: Record<string, unknown>,
    areaName: string,
  ): void => {
    const expectedArea = isSessionStoreAvailable() ? 'session' : 'local';
    if (areaName !== expectedArea) {
      return;
    }
    if (
      !(REQUEST_LOG_RECORDING_KEY in changes) &&
      !(REQUEST_LOG_WS_RECORDING_KEY in changes) &&
      !(REQUEST_LOG_ENTRIES_KEY in changes) &&
      !(REQUEST_LOG_TYPE_FILTER_KEY in changes) &&
      !(REQUEST_LOG_SOCKETS_KEY in changes)
    ) {
      return;
    }
    void getRequestLogState().then(callback);
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}

/** True when either the request log or WebSocket capture is recording. */
export function anyRecording(state: RequestLogState): boolean {
  return state.recording.some(Boolean) || state.wsRecording.some(Boolean);
}
