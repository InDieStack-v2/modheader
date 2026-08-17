# Contracts: Request Log

**Date**: 2026-08-17 | **Feature**: `003-profile-request-logs`

Internal contracts between popup, background, and the optional page hook. No public network API.

## Session store (`lib/session-log.ts`)

```ts
export function getRequestLogState(): Promise<RequestLogState>;
export function setRecording(profileIndex: number, on: boolean): Promise<void>;
export function stopAllRecording(): Promise<void>;
export function syncRecordingWithPatching(input: {
  paused: boolean;
  selectedIndex: number;
  selectedHasRules: boolean;
}): Promise<void>;
export function appendOrUpdateEntry(
  profileIndex: number,
  entry: RequestLogEntry,
): Promise<void>;
export function clearEntries(profileIndex: number): Promise<void>;
export function remapOnReorder(from: number, to: number): Promise<void>;
export function dropAt(index: number): Promise<void>;
/** Insert recording=false and [] at index (profile undo). Does not restore old entries. */
export function insertSlot(index: number): Promise<void>;
export function ensureSlots(profileCount: number): Promise<void>;
export function subscribeRequestLog(
  cb: (state: RequestLogState) => void,
): () => void;
```

`appendOrUpdateEntry` upserts by `id`, newest-first, applies the 200 / 8 MB caps.

`syncRecordingWithPatching` is the single idle path: global pause turns every recording flag off; no enabled rules on the selected profile turns that flag off. Entries are left in place. Tab-lock does not flip recording.

`dropAt` / `insertSlot` must stay aligned with `profiles[]`. Undo of a deleted profile calls `insertSlot` at the restored index so later profiles keep their own logs; the restored profile gets an empty log (spec: undo does not restore the log).

## Match predicate (`lib/request-match.ts`)

```ts
export function sanitizeLogUrl(url: string): string;

export function profileWouldPatch(
  profile: Profile,
  input: {
    url: string;
    resourceType: string;
    tabId: number | undefined;
    paused: boolean;
    lockedTabId: number | null;
  },
): boolean;
export function profileHasEnabledRules(profile: Profile): boolean;
```

Must stay consistent with `compileProfileToRules` filter grouping (URL filters OR, type filters OR, groups AND; empty groups pass; paused / no enabled rules / tab-lock miss → false).

## Body helpers (`lib/request-body.ts`)

```ts
export function captureFromWebRequestBody(
  body: { formData?: Record<string, unknown>; raw?: { bytes?: ArrayBuffer }[] } | undefined,
): BodyCapture;

export function captureText(source: string | ArrayBuffer, maxBytes?: number): BodyCapture;
```

`maxBytes` default 65_536.

## cURL (`lib/curl.ts`)

```ts
export function toCurl(entry: RequestLogEntry): {
  command: string;
  bodyOmitted: boolean;
};
```

Patched request only. Real header values. `--data-raw` only for `requestBody.kind === 'text'`.

## Background observer

- Top-level `webRequest` listeners (so the worker wakes). If no profile is recording, return immediately.
- Only the **selected** profile can receive new rows.
- Arm/disarm the MAIN-world hook via `browser.scripting.registerContentScripts` / `unregisterContentScripts` when the number of `true` recording flags crosses 0 ↔ 1.
- Message type from hook: `{ type: 'modheader:request-log-body'; method: string; url: string; body: string; startedAt: number }`.
- Attach a hook body to at most one entry: among **pending** rows for the selected profile with the same method and `sanitizeLogUrl(url)`, whose `startedAt` is within 2s of the hook's `startedAt`, and that still have no `responseBody` (or `kind === 'unavailable'`). If several match, pick the **oldest** `startedAt`, then lowest `id`. If none match, do not invent a row.

## URL sanitize

Input `https://user:pass@api.example.com/v1/x?q=1#frag` → stored `https://api.example.com/v1/x?q=1`.
