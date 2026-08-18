# Contracts: Request Log Body Capture

**Date**: 2026-08-18 | **Feature**: `005-request-log-detail`

Extends `specs/003-profile-request-logs/contracts/request-log.md`. Session store, match predicate, cURL, and “do not invent a row” stay.

## `lib/request-match.ts`

```ts
export function pickEntryForBody(
  entries: RequestLogEntry[],
  input: { method: string; url: string; startedAt: number },
  which: 'request' | 'response',
): RequestLogEntry | undefined;
```

Behavioral contract:

- Same method (case-insensitive) and `sanitizeLogUrl(url)`.
- `|entry.startedAt - input.startedAt| ≤ 10_000`.
- Status may be `pending`, an HTTP code, or `failed`.
- For `which === 'response'`, skip rows whose `responseBody.kind` is already `text` or `binary`.
- For `which === 'request'`, skip rows whose `requestBody.kind` is already `text` or `binary`.
- Among remaining: oldest `startedAt`, then lowest `id`.
- Return `undefined` rather than creating a row.

`pickEntryForBody(entries, input)` without `which` keeps today’s response-body meaning for existing tests; implementation may overload or default `which` to `'response'`.

## `lib/body-format.ts` (new)

```ts
export function formatBodyForDisplay(text: string): string;
```

If `JSON.parse(text)` yields a non-null object or array, return `JSON.stringify(value, null, 2)`. Otherwise return `text` unchanged. Never throws.

## Hook files (`public/request-log-main.js`, `public/request-log-hook.js`)

MAIN hook:

- Install once per realm (`__modheaderLogHookInstalled`).
- Patch `fetch` and `XMLHttpRequest`.
- Resolve URL with `new URL(raw, location.href).href` (catch → `String(raw)`).
- At send: post request body when it can be serialized as text or marked binary/empty.
- At settle: post response text via `res.clone().text()` / `xhr.responseText` (empty string → `empty`).
- Do not hook service-worker global scope (page + iframe windows only).

Isolated bridge: unchanged message type `modheader:request-log-body`, now forwarding the optional request/response fields.

## `lib/request-log-observer.ts`

```ts
export async function syncRequestLogHook(): Promise<void>;
export async function injectHookIntoOpenTabs(): Promise<void>;
```

`syncRequestLogHook`:

- If any profile is recording: `registerContentScripts` for missing ids **and** `injectHookIntoOpenTabs()`.
- If none are recording: `unregisterContentScripts` for the hook ids.

`injectHookIntoOpenTabs`:

- Query all tabs. Skip missing id/url and non-web schemes.
- `executeScript` MAIN `request-log-main.js` then isolated `request-log-hook.js`, `allFrames: true`, `injectImmediately: true`.
- Swallow per-tab errors (restricted pages).

`handleLogBodyMessage`:

- Ignore unless the **selected** profile is recording.
- Attach `requestBody` / `responseBody` via `pickEntryForBody` + `mergeLogEntry` + `appendOrUpdateEntry`.
- Still do not invent rows.

## Permissions

No additions. Uses existing `scripting`, `tabs`, `webRequest`, `host_permissions: <all_urls>`.
