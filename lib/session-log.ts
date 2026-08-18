import { browser } from 'wxt/browser';
import type { RequestLogEntry, RequestLogState } from './types';

export const REQUEST_LOG_RECORDING_KEY = 'requestLogRecording';
export const REQUEST_LOG_ENTRIES_KEY = 'requestLogEntries';
export const REQUEST_LOG_TYPE_FILTER_KEY = 'requestLogTypeFilter';

const MAX_ENTRIES = 200;
const MAX_BYTES = 8 * 1024 * 1024;

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
    REQUEST_LOG_ENTRIES_KEY,
    REQUEST_LOG_TYPE_FILTER_KEY,
  ]);
}

export async function getRequestLogState(): Promise<RequestLogState> {
  const data = await area().get([
    REQUEST_LOG_RECORDING_KEY,
    REQUEST_LOG_ENTRIES_KEY,
    REQUEST_LOG_TYPE_FILTER_KEY,
  ]);
  return {
    recording:
      (data[REQUEST_LOG_RECORDING_KEY] as boolean[] | undefined) ?? [],
    entries:
      (data[REQUEST_LOG_ENTRIES_KEY] as RequestLogEntry[][] | undefined) ?? [],
    typeFilter:
      (data[REQUEST_LOG_TYPE_FILTER_KEY] as string[][] | undefined) ?? [],
  };
}

async function writeState(state: RequestLogState): Promise<void> {
  await area().set({
    [REQUEST_LOG_RECORDING_KEY]: state.recording,
    [REQUEST_LOG_ENTRIES_KEY]: state.entries,
    [REQUEST_LOG_TYPE_FILTER_KEY]: state.typeFilter,
  });
}

function pad(state: RequestLogState, count: number): RequestLogState {
  const recording = [...state.recording];
  const entries = state.entries.map((list) => [...list]);
  const typeFilter = state.typeFilter.map((list) => [...list]);
  while (recording.length < count) {
    recording.push(false);
  }
  while (entries.length < count) {
    entries.push([]);
  }
  while (typeFilter.length < count) {
    typeFilter.push([]);
  }
  return { recording, entries, typeFilter };
}

export async function ensureSlots(profileCount: number): Promise<void> {
  const next = pad(await getRequestLogState(), profileCount);
  await writeState(next);
}

export async function setRecording(
  profileIndex: number,
  on: boolean,
): Promise<void> {
  const next = pad(await getRequestLogState(), profileIndex + 1);
  next.recording[profileIndex] = on;
  await writeState(next);
}

export async function stopAllRecording(): Promise<void> {
  const state = await getRequestLogState();
  if (!state.recording.some(Boolean)) {
    return;
  }
  await writeState({
    ...state,
    recording: state.recording.map(() => false),
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
  }
}

function estimatedBytes(state: RequestLogState): number {
  return JSON.stringify(state).length;
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
  const queued = writeChain.then(run, run);
  writeChain = queued.then(
    () => undefined,
    () => undefined,
  );
  await queued;
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
    state.entries.length,
    state.typeFilter.length,
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
  next.entries = move(next.entries);
  next.typeFilter = move(next.typeFilter);
  await writeState(next);
}

export async function dropAt(index: number): Promise<void> {
  const state = await getRequestLogState();
  const next = pad(state, Math.max(state.recording.length, index + 1));
  if (index < 0 || index >= next.recording.length) {
    return;
  }
  next.recording.splice(index, 1);
  next.entries.splice(index, 1);
  next.typeFilter.splice(index, 1);
  await writeState(next);
}

export async function insertSlot(index: number): Promise<void> {
  const state = await getRequestLogState();
  const n = Math.max(state.recording.length, state.entries.length, state.typeFilter.length);
  const next = pad(state, n);
  const at = Math.max(0, Math.min(index, next.recording.length));
  next.recording.splice(at, 0, false);
  next.entries.splice(at, 0, []);
  next.typeFilter.splice(at, 0, []);
  await writeState(next);
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
      !(REQUEST_LOG_ENTRIES_KEY in changes) &&
      !(REQUEST_LOG_TYPE_FILTER_KEY in changes)
    ) {
      return;
    }
    void getRequestLogState().then(callback);
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}

export function anyRecording(state: RequestLogState): boolean {
  return state.recording.some(Boolean);
}
