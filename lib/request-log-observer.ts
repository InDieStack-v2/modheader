import { browser } from 'wxt/browser';
import { captureFromWebRequestBody, captureText } from './request-body';
import type { BodyCapture } from './types';
import {
  overlayHeaderRules,
  pickEntryForBody,
  pickSocketForHook,
  profilePatchesWebSocket,
  profileWouldPatch,
  sanitizeLogUrl,
} from './request-match';
import {
  anyRecording,
  appendOrUpdateEntry,
  appendWsMessages,
  bindSocketHook,
  getRequestLogState,
  mergeLogEntry,
  upsertSocket,
} from './session-log';
import { getRuntimeState } from './storage';
import type {
  NameValue,
  RequestLogEntry,
  WsConnectionEntry,
  WsMessage,
} from './types';

const HOOK_IDS = [
  'modheader-request-log-hook',
  'modheader-request-log-main',
] as const;

interface WebRequestDetails {
  requestId: string;
  url: string;
  method: string;
  type: string;
  tabId: number;
  statusCode?: number;
  requestBody?: {
    formData?: Record<string, unknown>;
    raw?: { bytes?: ArrayBuffer }[];
  };
  requestHeaders?: { name: string; value?: string }[];
  responseHeaders?: { name: string; value?: string }[];
  error?: string;
}

const pending = new Map<string, RequestLogEntry>();

function toNameValues(
  headers: { name: string; value?: string }[] | undefined,
): NameValue[] {
  return (headers ?? []).map((header) => ({
    name: header.name,
    value: header.value ?? '',
  }));
}

async function selectedContext() {
  const runtime = await getRuntimeState();
  const log = await getRequestLogState();
  const index =
    runtime.selectedProfileIndex < runtime.profiles.length
      ? runtime.selectedProfileIndex
      : 0;
  return {
    runtime,
    log,
    index,
    profile: runtime.profiles[index],
    recording: log.recording[index] === true,
    wsRecording: log.wsRecording[index] === true,
  };
}

async function ensureEntry(
  details: WebRequestDetails,
): Promise<RequestLogEntry | null> {
  const existing = pending.get(details.requestId);
  if (existing) {
    return existing;
  }
  const ctx = await selectedContext();
  if (!ctx.recording || !ctx.profile) {
    return null;
  }
  if (
    !profileWouldPatch(ctx.profile, {
      url: details.url,
      resourceType: details.type,
      tabId: details.tabId >= 0 ? details.tabId : undefined,
      paused: ctx.runtime.isPaused ?? false,
      lockedTabId: ctx.runtime.lockedTabId ?? null,
    })
  ) {
    return null;
  }
  const entry: RequestLogEntry = {
    id: details.requestId,
    profileIndex: ctx.index,
    startedAt: Date.now(),
    method: (details.method || 'GET').toUpperCase(),
    url: sanitizeLogUrl(details.url),
    resourceType: details.type,
    status: 'pending',
    requestHeaders: overlayHeaderRules([], ctx.profile.headers),
    responseHeaders: overlayHeaderRules([], ctx.profile.respHeaders),
    requestBody: captureFromWebRequestBody(details.requestBody),
    responseBody: { kind: 'unavailable' },
  };
  pending.set(entry.id, entry);
  return entry;
}

async function upsert(entry: RequestLogEntry): Promise<void> {
  const current = pending.get(entry.id);
  const merged = current ? mergeLogEntry(current, entry) : entry;
  pending.set(merged.id, merged);
  await appendOrUpdateEntry(merged.profileIndex, merged);
}

// --- WebSocket handshakes (spec 006): routed to the socket store, never the HTTP log ---

const pendingSockets = new Map<string, WsConnectionEntry>();

async function ensureSocket(
  details: WebRequestDetails,
): Promise<WsConnectionEntry | null> {
  const existing = pendingSockets.get(details.requestId);
  if (existing) {
    return existing;
  }
  const ctx = await selectedContext();
  if (!ctx.wsRecording || !ctx.profile) {
    return null;
  }
  const tabId = details.tabId >= 0 ? details.tabId : undefined;
  if (
    !profilePatchesWebSocket(ctx.profile, {
      url: details.url,
      tabId,
      paused: ctx.runtime.isPaused ?? false,
      lockedTabId: ctx.runtime.lockedTabId ?? null,
    })
  ) {
    return null;
  }
  const entry: WsConnectionEntry = {
    id: details.requestId,
    profileIndex: ctx.index,
    tabId: tabId ?? -1,
    startedAt: Date.now(),
    url: sanitizeLogUrl(details.url),
    state: 'connecting',
    requestHeaders: overlayHeaderRules([], ctx.profile.headers),
    messagesObserved: false,
    messages: [],
    droppedMessages: false,
  };
  pendingSockets.set(entry.id, entry);
  return entry;
}

type SocketEvent = 'before' | 'sendHeaders' | 'headers' | 'completed' | 'error';

async function handleSocketEvent(
  event: SocketEvent,
  details: WebRequestDetails,
): Promise<void> {
  const existing = await ensureSocket(details);
  if (!existing) {
    return;
  }
  let next: WsConnectionEntry = existing;
  if (event === 'sendHeaders') {
    const { profile } = await selectedContext();
    next = {
      ...existing,
      requestHeaders: overlayHeaderRules(
        toNameValues(details.requestHeaders),
        profile?.headers,
      ),
    };
  } else if (event === 'headers') {
    next = {
      ...existing,
      // 101 = handshake accepted; anything else means the upgrade was refused.
      state: details.statusCode === 101 ? 'open' : 'failed',
      responseHeaders: toNameValues(details.responseHeaders),
    };
  } else if (event === 'error') {
    // Only applies while connecting (mergeWsState); later closes come from the page hook.
    next = { ...existing, state: 'failed' };
  }
  if (event === 'completed' || event === 'error') {
    pendingSockets.delete(details.requestId);
  } else {
    pendingSockets.set(next.id, next);
  }
  await upsertSocket(next.profileIndex, next);
}

function isInjectableUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

interface ScriptingApi {
  getRegisteredContentScripts(): Promise<{ id: string }[]>;
  registerContentScripts(scripts: unknown[]): Promise<void>;
  unregisterContentScripts(filter: { ids: string[] }): Promise<void>;
  executeScript?(details: {
    target: { tabId: number; allFrames?: boolean };
    files: string[];
    world?: 'MAIN' | 'ISOLATED';
    injectImmediately?: boolean;
  }): Promise<unknown>;
}

function scriptingApi(): ScriptingApi | undefined {
  return (
    browser as unknown as {
      scripting?: ScriptingApi;
    }
  ).scripting;
}

async function executeOnTab(
  scripting: ScriptingApi,
  tabId: number,
  files: string[],
  world?: 'MAIN' | 'ISOLATED',
): Promise<void> {
  if (!scripting.executeScript) {
    return;
  }
  const target = { tabId, allFrames: true };
  const base = { target, files, ...(world ? { world } : {}) };
  try {
    await scripting.executeScript({ ...base, injectImmediately: true });
  } catch {
    try {
      await scripting.executeScript(base);
    } catch {
      /* restricted page or missing world support */
    }
  }
}

export async function injectHookIntoOpenTabs(): Promise<void> {
  const scripting = scriptingApi();
  const tabsApi = (
    browser as unknown as {
      tabs?: {
        query(query: Record<string, never>): Promise<{ id?: number; url?: string }[]>;
      };
    }
  ).tabs;
  if (!scripting?.executeScript || !tabsApi?.query) {
    return;
  }
  let tabs: { id?: number; url?: string }[] = [];
  try {
    tabs = await tabsApi.query({});
  } catch {
    return;
  }
  for (const tab of tabs) {
    if (tab.id == null || !tab.url || !isInjectableUrl(tab.url)) {
      continue;
    }
    await injectHookIntoTab(scripting, tab.id);
  }
}

async function injectHookIntoTab(
  scripting: ScriptingApi,
  tabId: number,
): Promise<void> {
  await executeOnTab(scripting, tabId, ['request-log-main.js'], 'MAIN');
  await executeOnTab(scripting, tabId, ['request-log-hook.js']);
}

function watchTabsForHook(): void {
  const tabsApi = (
    browser as unknown as {
      tabs?: {
        onUpdated: {
          addListener(
            cb: (
              tabId: number,
              changeInfo: { status?: string; url?: string },
              tab: { url?: string },
            ) => void,
          ): void;
        };
      };
    }
  ).tabs;
  if (!tabsApi?.onUpdated) {
    return;
  }
  tabsApi.onUpdated.addListener((tabId, changeInfo, tab) => {
    const url = changeInfo.url ?? tab.url;
    const navigated = Boolean(changeInfo.url);
    const loaded =
      changeInfo.status === 'loading' || changeInfo.status === 'complete';
    if ((!navigated && !loaded) || !url || !isInjectableUrl(url)) {
      return;
    }
    void (async () => {
      const state = await getRequestLogState();
      if (!anyRecording(state)) {
        return;
      }
      const scripting = scriptingApi();
      if (!scripting) {
        return;
      }
      await injectHookIntoTab(scripting, tabId);
    })();
  });
}

let openTabHooksArmed = false;

export async function syncRequestLogHook(): Promise<void> {
  const scripting = scriptingApi();
  if (!scripting) {
    return;
  }
  const state = await getRequestLogState();
  const should = anyRecording(state);
  const existing = await scripting.getRegisteredContentScripts();
  const existingIds = new Set(existing.map((script) => script.id));
  const missing = HOOK_IDS.filter((id) => !existingIds.has(id));
  const extra = [...existingIds].filter(
    (id) =>
      id === 'modheader-request-log-hook' || id === 'modheader-request-log-main',
  );
  if (should) {
    if (missing.length > 0) {
      const scripts = [];
      if (missing.includes('modheader-request-log-main')) {
        scripts.push({
          id: 'modheader-request-log-main',
          js: ['request-log-main.js'],
          matches: ['<all_urls>'],
          runAt: 'document_start',
          allFrames: true,
          world: 'MAIN',
          persistAcrossSessions: false,
        });
      }
      if (missing.includes('modheader-request-log-hook')) {
        scripts.push({
          id: 'modheader-request-log-hook',
          js: ['request-log-hook.js'],
          matches: ['<all_urls>'],
          runAt: 'document_start',
          allFrames: true,
          persistAcrossSessions: false,
        });
      }
      if (scripts.length > 0) {
        try {
          await scripting.registerContentScripts(scripts);
        } catch {
          const isolated = scripts.filter(
            (script) => script.id === 'modheader-request-log-hook',
          );
          if (isolated.length > 0) {
            await scripting.registerContentScripts(isolated);
          }
        }
      }
    }
    if (!openTabHooksArmed) {
      openTabHooksArmed = true;
      await injectHookIntoOpenTabs();
    }
  } else {
    openTabHooksArmed = false;
    if (extra.length > 0) {
      await scripting.unregisterContentScripts({ ids: extra });
    }
  }
}

type HookBodyKind = 'text' | 'binary' | 'empty';

export interface LogBodyMessage {
  type?: string;
  method?: string;
  url?: string;
  body?: string;
  startedAt?: number;
  requestBody?: string;
  requestBodyKind?: HookBodyKind;
  responseBody?: string;
  responseBodyKind?: HookBodyKind;
}

function bodyFromHook(
  text: string | undefined,
  kind?: HookBodyKind,
): BodyCapture {
  if (kind === 'binary') {
    return { kind: 'binary' };
  }
  if (kind === 'empty') {
    return { kind: 'empty' };
  }
  return captureText(text ?? '');
}

export async function handleLogBodyMessage(
  message: LogBodyMessage,
): Promise<void> {
  if (message.type !== 'modheader:request-log-body') {
    return;
  }
  const { index, recording, log } = await selectedContext();
  if (!recording) {
    return;
  }
  const input = {
    method: message.method ?? 'GET',
    url: message.url ?? '',
    startedAt: message.startedAt ?? Date.now(),
  };
  const hasRequest =
    message.requestBody !== undefined || message.requestBodyKind !== undefined;
  const hasResponse =
    message.responseBody !== undefined ||
    message.responseBodyKind !== undefined ||
    message.body !== undefined;

  if (hasRequest) {
    const match = pickEntryForBody(log.entries[index] ?? [], input, 'request');
    if (match) {
      await upsert({
        ...match,
        requestBody: bodyFromHook(message.requestBody, message.requestBodyKind),
      });
    }
  }

  if (hasResponse) {
    const latest = hasRequest ? await getRequestLogState() : log;
    const match = pickEntryForBody(
      latest.entries[index] ?? [],
      input,
      'response',
    );
    if (match) {
      await upsert({
        ...match,
        responseBody: bodyFromHook(
          message.responseBody ?? message.body,
          message.responseBodyKind,
        ),
      });
    }
  }
}

// --- WebSocket page-hook events (spec 006, contracts/ws-hook-messages.md) ---

export interface WsHookMessage {
  type?: string;
  event?: 'open' | 'message' | 'close' | 'error';
  socketId?: number;
  at?: number;
  url?: string;
  seq?: number;
  dir?: WsMessage['dir'];
  kind?: WsMessage['kind'];
  data?: string;
  size?: number;
  truncated?: boolean;
  code?: number;
  reason?: string;
}

export interface WsHookSender {
  tab?: { id?: number };
  frameId?: number;
}

const WS_FLUSH_MS = 250;
const WS_BIND_RETRY_MS = 250;
/** Sockets with no patched row; their later events are dropped cheaply. */
const ignoredHooks = new Set<string>();
/** hookKey → owning profile slot; rebuilt from storage after a worker restart. */
const boundHooks = new Map<string, number>();
// ponytail: up to WS_FLUSH_MS of messages live only here (constitution 2.1.0 coalescing exception).
const wsBuffers = new Map<string, WsMessage[]>();
let wsFlushTimer: ReturnType<typeof setTimeout> | undefined;

async function findBoundRow(
  hookKey: string,
): Promise<{ profileIndex: number; row: WsConnectionEntry } | null> {
  const log = await getRequestLogState();
  const cached = boundHooks.get(hookKey);
  const slots = cached != null ? [cached] : log.sockets.map((_, i) => i);
  for (const profileIndex of slots) {
    const row = (log.sockets[profileIndex] ?? []).find(
      (item) => item.hookKey === hookKey,
    );
    if (row) {
      boundHooks.set(hookKey, profileIndex);
      return { profileIndex, row };
    }
  }
  return null;
}

async function flushWsKey(hookKey: string): Promise<void> {
  const messages = wsBuffers.get(hookKey);
  wsBuffers.delete(hookKey);
  if (!messages?.length) {
    return;
  }
  const profileIndex = boundHooks.get(hookKey);
  if (profileIndex == null) {
    return;
  }
  const log = await getRequestLogState();
  if (log.wsRecording[profileIndex] !== true) {
    return; // paused since these arrived
  }
  await appendWsMessages(profileIndex, hookKey, messages);
}

async function flushAllWs(): Promise<void> {
  wsFlushTimer = undefined;
  for (const hookKey of [...wsBuffers.keys()]) {
    await flushWsKey(hookKey);
  }
}

async function bindOpenedSocket(
  hookKey: string,
  tabId: number,
  message: WsHookMessage,
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctx = await selectedContext();
    if (!ctx.wsRecording) {
      return;
    }
    const row = pickSocketForHook(ctx.log.sockets[ctx.index] ?? [], {
      tabId,
      url: message.url ?? '',
      at: message.at ?? Date.now(),
    });
    if (row) {
      boundHooks.set(hookKey, ctx.index);
      await bindSocketHook(ctx.index, row.id, hookKey);
      return;
    }
    // The handshake row may still be in the write queue; look once more.
    await new Promise((resolve) => setTimeout(resolve, WS_BIND_RETRY_MS));
  }
  ignoredHooks.add(hookKey);
}

// Events of one socket must be handled in order: `open` binds the row that
// the following `message` events append to.
let wsEventChain: Promise<void> = Promise.resolve();

export function handleWsHookMessage(
  message: WsHookMessage,
  sender: WsHookSender,
): Promise<void> {
  const run = () => processWsHookMessage(message, sender);
  const queued = wsEventChain.then(run, run);
  wsEventChain = queued.then(
    () => undefined,
    () => undefined,
  );
  return queued;
}

async function processWsHookMessage(
  message: WsHookMessage,
  sender: WsHookSender,
): Promise<void> {
  const tabId = sender.tab?.id;
  if (message.type !== 'modheader:ws' || tabId == null || message.socketId == null) {
    return;
  }
  const hookKey = `${tabId}:${sender.frameId ?? 0}:${message.socketId}`;
  if (ignoredHooks.has(hookKey)) {
    return;
  }
  if (message.event === 'open') {
    await bindOpenedSocket(hookKey, tabId, message);
    return;
  }
  const bound = await findBoundRow(hookKey);
  if (!bound) {
    return;
  }
  const log = await getRequestLogState();
  if (log.wsRecording[bound.profileIndex] !== true) {
    wsBuffers.delete(hookKey);
    return;
  }
  if (message.event === 'message') {
    const list = wsBuffers.get(hookKey) ?? [];
    list.push({
      seq: message.seq ?? 0,
      at: message.at ?? Date.now(),
      dir: message.dir === 'sent' ? 'sent' : 'received',
      kind: message.kind === 'binary' ? 'binary' : 'text',
      data: message.data ?? '',
      size: message.size ?? 0,
      ...(message.truncated ? { truncated: true } : {}),
    });
    wsBuffers.set(hookKey, list);
    wsFlushTimer ??= setTimeout(() => void flushAllWs(), WS_FLUSH_MS);
    return;
  }
  if (message.event === 'close') {
    await flushWsKey(hookKey);
    await upsertSocket(bound.profileIndex, {
      ...bound.row,
      state: 'closed',
      closeCode: message.code,
      closeReason: message.reason ?? '',
    });
    return;
  }
  if (message.event === 'error') {
    // mergeWsState keeps an open/closed row; only a connecting row becomes failed.
    await upsertSocket(bound.profileIndex, { ...bound.row, state: 'failed' });
  }
}

export function startRequestLogObserver(): void {
  watchTabsForHook();
  const wr = (
    browser as unknown as {
      webRequest?: {
        onBeforeRequest: {
          addListener(
            cb: (d: WebRequestDetails) => void,
            filter: { urls: string[] },
            extra?: string[],
          ): void;
        };
        onSendHeaders: {
          addListener(
            cb: (d: WebRequestDetails) => void,
            filter: { urls: string[] },
            extra?: string[],
          ): void;
        };
        onHeadersReceived: {
          addListener(
            cb: (d: WebRequestDetails) => void,
            filter: { urls: string[] },
            extra?: string[],
          ): void;
        };
        onCompleted: {
          addListener(
            cb: (d: WebRequestDetails) => void,
            filter: { urls: string[] },
          ): void;
        };
        onErrorOccurred: {
          addListener(
            cb: (d: WebRequestDetails) => void,
            filter: { urls: string[] },
          ): void;
        };
      };
    }
  ).webRequest;
  if (!wr) {
    return;
  }

  const filter = { urls: ['<all_urls>'] };

  const listen = (
    event: {
      addListener(
        cb: (d: WebRequestDetails) => void,
        filter: { urls: string[] },
        extra?: string[],
      ): void;
    },
    cb: (d: WebRequestDetails) => void,
    extra?: string[],
  ) => {
    try {
      if (extra) {
        event.addListener(cb, filter, extra);
      } else {
        event.addListener(cb, filter);
      }
    } catch {
      event.addListener(cb, filter);
    }
  };

  listen(
    wr.onBeforeRequest,
    (details) => {
      if (details.type === 'websocket') {
        void handleSocketEvent('before', details);
        return;
      }
      void (async () => {
        const existing = await ensureEntry(details);
        if (!existing) {
          return;
        }
        const updated: RequestLogEntry = {
          ...existing,
          requestBody: captureFromWebRequestBody(details.requestBody),
        };
        await upsert(updated);
      })();
    },
    ['requestBody'],
  );

  listen(
    wr.onSendHeaders,
    (details) => {
      if (details.type === 'websocket') {
        void handleSocketEvent('sendHeaders', details);
        return;
      }
      void (async () => {
        const existing = await ensureEntry(details);
        if (!existing) {
          return;
        }
        const { profile } = await selectedContext();
        const observed = toNameValues(details.requestHeaders);
        const updated: RequestLogEntry = {
          ...existing,
          requestHeaders: overlayHeaderRules(observed, profile?.headers),
        };
        await upsert(updated);
      })();
    },
    ['requestHeaders', 'extraHeaders'],
  );

  listen(
    wr.onHeadersReceived,
    (details) => {
      if (details.type === 'websocket') {
        void handleSocketEvent('headers', details);
        return;
      }
      void (async () => {
        const existing = await ensureEntry(details);
        if (!existing) {
          return;
        }
        const { profile } = await selectedContext();
        const observed = toNameValues(details.responseHeaders);
        const updated: RequestLogEntry = {
          ...existing,
          status: details.statusCode ?? existing.status,
          responseHeaders: overlayHeaderRules(observed, profile?.respHeaders),
        };
        await upsert(updated);
      })();
    },
    ['responseHeaders', 'extraHeaders'],
  );

  wr.onCompleted.addListener(
    (details) => {
      if (details.type === 'websocket') {
        void handleSocketEvent('completed', details);
        return;
      }
      void (async () => {
        const existing = await ensureEntry(details);
        if (!existing) {
          return;
        }
        const updated: RequestLogEntry = {
          ...existing,
          status: details.statusCode ?? existing.status,
        };
        pending.delete(details.requestId);
        await upsert(updated);
      })();
    },
    filter,
  );

  wr.onErrorOccurred.addListener((details) => {
    if (details.type === 'websocket') {
      void handleSocketEvent('error', details);
      return;
    }
    void (async () => {
      const existing = await ensureEntry(details);
      if (!existing) {
        return;
      }
      pending.delete(details.requestId);
      await upsert({ ...existing, status: 'failed' });
    })();
  }, filter);

  browser.runtime.onMessage.addListener((message: unknown, sender) => {
    const msg = (message ?? {}) as { type?: string };
    if (msg.type === 'modheader:ws') {
      void handleWsHookMessage(msg as WsHookMessage, sender as WsHookSender);
      return;
    }
    void handleLogBodyMessage(msg as LogBodyMessage);
  });
}
