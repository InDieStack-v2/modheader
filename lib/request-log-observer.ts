import { browser } from 'wxt/browser';
import { captureFromWebRequestBody, captureText } from './request-body';
import {
  overlayHeaderRules,
  pickEntryForBody,
  profileWouldPatch,
  sanitizeLogUrl,
} from './request-match';
import {
  anyRecording,
  appendOrUpdateEntry,
  getRequestLogState,
  mergeLogEntry,
} from './session-log';
import { getRuntimeState } from './storage';
import type { NameValue, RequestLogEntry } from './types';

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

export async function syncRequestLogHook(): Promise<void> {
  const scripting = (
    browser as unknown as {
      scripting?: {
        getRegisteredContentScripts(): Promise<{ id: string }[]>;
        registerContentScripts(scripts: unknown[]): Promise<void>;
        unregisterContentScripts(filter: { ids: string[] }): Promise<void>;
      };
    }
  ).scripting;
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
  if (should && missing.length > 0) {
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
  } else if (!should && extra.length > 0) {
    await scripting.unregisterContentScripts({ ids: extra });
  }
}

export async function handleLogBodyMessage(message: {
  type?: string;
  method?: string;
  url?: string;
  body?: string;
  startedAt?: number;
}): Promise<void> {
  if (message.type !== 'modheader:request-log-body') {
    return;
  }
  const { index, recording, log } = await selectedContext();
  if (!recording) {
    return;
  }
  const match = pickEntryForBody(log.entries[index] ?? [], {
    method: message.method ?? 'GET',
    url: message.url ?? '',
    startedAt: message.startedAt ?? Date.now(),
  });
  if (!match) {
    return;
  }
  const updated: RequestLogEntry = {
    ...match,
    responseBody: captureText(message.body ?? ''),
  };
  await upsert(updated);
}

export function startRequestLogObserver(): void {
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
    void (async () => {
      const existing = await ensureEntry(details);
      if (!existing) {
        return;
      }
      pending.delete(details.requestId);
      await upsert({ ...existing, status: 'failed' });
    })();
  }, filter);

  browser.runtime.onMessage.addListener((message: unknown) => {
    void handleLogBodyMessage(
      (message ?? {}) as {
        type?: string;
        method?: string;
        url?: string;
        body?: string;
        startedAt?: number;
      },
    );
  });
}
