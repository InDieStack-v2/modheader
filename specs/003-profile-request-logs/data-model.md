# Data Model: Profile Request Logs

**Date**: 2026-08-17 | **Feature**: `003-profile-request-logs`

Profile / HeaderRule / Filter / RuntimeState documents are **unchanged**. See `specs/001-modernize-react-migration/data-model.md`. This feature adds session-only types stored in `browser.storage.session`.

## RequestLogState (`storage.session`)

| Key | Type | Notes |
|-----|------|-------|
| `requestLogRecording` | `boolean[]` | Parallel to `profiles[]`. `true` = that index is recording. Missing/short array = off. |
| `requestLogEntries` | `RequestLogEntry[][]` | Parallel to `profiles[]`. Newest first. |

Not stored: workspace tab (always Headers on open / profile switch).

### Fallback (`storage.local`, only if `storage.session` is absent)

Same shapes at keys `requestLogRecording` and `requestLogEntries`. Deleted in `runtime.onStartup`.

## RequestLogEntry

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | yes | Opaque; `requestId` from webRequest plus a nonce if needed |
| `profileIndex` | number | yes | Owner at capture time |
| `startedAt` | number | yes | `Date.now()` when the request was first seen |
| `method` | string | yes | HTTP method, upper-case |
| `url` | string | yes | Origin + path + query; no userinfo, no fragment |
| `resourceType` | string | yes | webRequest / DNR type (`xmlhttprequest`, `main_frame`, …) |
| `status` | `'pending' \| number \| 'failed'` | yes | `pending` until completed/error |
| `requestHeaders` | `NameValue[]` | yes | Post-modification snapshot; values unredacted |
| `responseHeaders` | `NameValue[]` | no | Present after `onHeadersReceived` |
| `requestBody` | `BodyCapture` | no | |
| `responseBody` | `BodyCapture` | no | Typically only XHR/fetch |

## NameValue

| Field | Type |
|-------|------|
| `name` | string |
| `value` | string |

## BodyCapture

| Field | Type | Notes |
|-------|------|-------|
| `kind` | `'text' \| 'binary' \| 'empty' \| 'unavailable'` | |
| `text` | string | Only when `kind === 'text'`; ≤ 64 KB |
| `truncated` | boolean | True if text was cut at 64 KB |

`empty` = no body (GET). `unavailable` = cannot capture (non-XHR response). `binary` = not valid UTF-8 text.

## Validation

- Sanitize URL on write: drop `username`/`password`/`hash`; keep `origin + pathname + search`.
- Cap list at 200 per profile; drop from the end (oldest).
- Before write, if estimated session payload &gt; 8 MB, drop oldest in that profile until under budget.
- Recording default is `false` for every index.
- On profile delete: `dropAt(index)` — splice both session arrays at that index (log discarded).
- On undo of profile delete: `insertSlot(index)` — insert `false` / `[]` at the restored index so remaining profiles keep their slots. The restored profile does **not** get its old log back.
- On reorder: apply the same `from → to` move to both session arrays.
- On duplicate/create: append `false` / `[]`.
- On browser restart: session area is empty → recording off, logs empty.
- Never write these keys into export or cloud backup.

## State transitions

```text
recording off  --start-->  recording on  (listeners armed if first profile)
recording on   --pause / global pause / no enabled rules-->  recording off (listeners disarmed if last profile)
recording on   --browser restart--> off + entries cleared
entry: pending --headers/status--> pending|code --complete/error--> code|failed
delete profile --> dropAt(index); shift higher indices
undo delete   --> insertSlot(index); empty log, recording off
```

Global pause and “no enabled header rules” use the same path: flip recording off and leave existing entries. Tab-lock does not flip the recording flag; it only prevents new entries for other tabs.
