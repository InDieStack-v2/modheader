# Data Model: Expandable Request Log Detail

**Date**: 2026-08-18 | **Feature**: `005-request-log-detail`

Profile / HeaderRule / Filter / RuntimeState / `RequestLogState` session keys are **unchanged**. See `specs/003-profile-request-logs/data-model.md` and the 004 `typeFilter` slot.

This feature does not add stored fields. It changes how `requestBody` / `responseBody` are **filled** and how an entry is **presented**.

## RequestLogEntry (unchanged shape)

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | webRequest `requestId` |
| `profileIndex` | number | Owner at capture |
| `startedAt` | number | First seen |
| `method` | string | Upper-case |
| `url` | string | Origin + path + query |
| `resourceType` | string | `xmlhttprequest` for page XHR/fetch |
| `status` | `'pending' \| number \| 'failed'` | |
| `requestHeaders` | `NameValue[]` | Post-modification |
| `responseHeaders` | `NameValue[]` | Optional until received |
| `requestBody` | `BodyCapture` | Now filled from webRequest **or** page hook |
| `responseBody` | `BodyCapture` | Page-initiated XHR/fetch: must become `text` / `empty` / `binary`, not linger as `unavailable` |

## BodyCapture (unchanged shape)

| Field | Type | Notes |
|-------|------|-------|
| `kind` | `'text' \| 'binary' \| 'empty' \| 'unavailable'` | |
| `text` | string | Only when `kind === 'text'`; ≤ 64 KB |
| `truncated` | boolean | Cut at 64 KB |

Meaning after this feature:

| Kind | When |
|------|------|
| `text` | Page-initiated XHR/fetch sent/received UTF-8 text |
| `empty` | No body (GET, 204, empty string) |
| `binary` | Not valid UTF-8, or FormData with files |
| `unavailable` | Non-XHR/fetch response, service-worker caller, or restricted page that could not be hooked |

`unavailable` is **not** valid for a page-initiated XHR/fetch body that existed (FR-017).

## Hook message (session-only, not stored)

```ts
{
  type: 'modheader:request-log-body';
  method: string;
  url: string;          // absolute, resolved against the frame URL
  startedAt: number;
  requestBody?: string; // omitted if unknown / binary
  requestBodyKind?: 'text' | 'binary' | 'empty';
  responseBody?: string;
  responseBodyKind?: 'text' | 'binary' | 'empty';
}
```

Background maps this onto `BodyCapture` via `captureText` / explicit kind, then `mergeLogEntry`.

## View state (not stored)

| Name | Lifetime | Rules |
|------|----------|-------|
| Expanded entry id | Popup React state | At most one. Cleared on Logs leave, profile switch, clear, or id no longer visible. |

## Validation (additions)

- Hook URL is sanitized with the same `sanitizeLogUrl` as webRequest rows.
- `preferBody`: `text`/`binary` replace `empty`/`unavailable`; never replace existing `text` with `unavailable`.
- Body attach may target a **completed** row (status is a number or `failed`), not only `pending`.
- Caps unchanged: 200 entries / profile, 64 KB / body, ~8 MB session budget.

## State transitions

```text
recording off --start--> recording on
  + registerContentScripts (future loads)
  + executeScript into already-open http(s) tabs (all frames)

recording on --pause / idle path--> recording off
  + unregisterContentScripts
  + live hooks may remain until navigation; messages ignored

entry.requestBody: empty|unavailable --hook/webRequest text--> text
entry.responseBody: unavailable --hook text|empty|binary--> that kind
entry.responseBody: unavailable --non-API / service worker--> stays unavailable
```
