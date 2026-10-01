# Research: Expandable Request Log Detail

**Date**: 2026-08-18 | **Feature**: `005-request-log-detail`

## D1 — Why bodies are missing today

**Decision**: Treat the empty detail as a capture bug, not a display-only gap. Three independent failures must all be fixed:

1. **Already-open tabs**: `scripting.registerContentScripts` only runs the MAIN-world hook at `document_start` on *future* loads. Start recording on a tab that is already open → hook is absent → no response body, and often no request body for `fetch`.
2. **Late attach**: `pickEntryForBody` requires `status === 'pending'`. The row usually reaches `onCompleted` before the hook’s `loadend` / `fetch` clone message arrives, so the body is dropped.
3. **Request body source**: the hook never posts the outbound payload. `webRequest.onBeforeRequest.requestBody` is frequently empty for `fetch` (streams, some FormData). The stored request body stays `empty`.

Relative hook URLs (`/api`) vs stored absolute URLs are a fourth, smaller miss; the hook will send an absolute URL.

**Rationale**: Clarifications require real XHR/fetch bodies, including on already-open tabs. Restyling `RequestLogDetail` without these fixes leaves SC-002 / SC-009 untestable.

**Alternatives considered**:

- Tell the user to reload after Start — rejected by clarification A (FR-018).
- `debugger` Network domain — full bodies for every type, but yellow infobar, DevTools conflict, store-review risk. Still rejected (003 D2, Principle III).
- Firefox-only `filterResponseData` — breaks Principle II.

## D2 — Request body from the page hook

**Decision**: Extend `public/request-log-main.js` so page-initiated `fetch` and `XMLHttpRequest` also post the **request** payload.

| Source | Serialization |
|--------|----------------|
| `string` | as-is (then `captureText`) |
| `URLSearchParams` | `toString()` |
| `FormData` | urlencoded if every value is a string; otherwise `binary` (do not invent a multipart dump) |
| `Blob` / `ArrayBuffer` / typed array | UTF-8 via existing `captureText`; invalid UTF-8 → `binary` |
| `ReadableStream` / unknown | omit; leave whatever `webRequest` stored |

Post request body at **send** time (`fetch` before `await`, `xhr.send`). Response body still posts on settle. Background merges with existing `preferBody` (a later `text` wins over `empty` / `unavailable`).

**Rationale**: Spec edge case: “if the browser’s request listener does not include a request payload, obtain it from the call itself.” The page already has the value. No new permission.

**Alternatives considered**:

- Rely only on `webRequest.requestBody` — fails FR-017 for common `fetch` POSTs.
- Always mark missing webRequest bodies `unavailable` — dishonest for GET (should be `empty`) and still empty for POST.

## D3 — Attach hook bodies to completed rows

**Decision**: Change `pickEntryForBody` (and a sibling for request-body attach):

- Match **page** hook messages to the selected profile’s log by method + `sanitizeLogUrl(url)`.
- Do **not** require `status === 'pending'`.
- Candidate must still have no real body of that kind (`missing`, `unavailable`, or `empty` may be replaced; `text` / `binary` stay).
- `startedAt` window: **10 seconds** (was 2s) so inject-then-first-call still matches.
- Tie-break unchanged: oldest `startedAt`, then lowest `id`.
- Hook sends `url` as `new URL(raw, location.href).href` so relative paths match stored origin+path+query.

`handleLogBodyMessage` accepts optional `requestBody` and `responseBody` on the same message type; either field may be absent.

**Rationale**: Completing a fast XHR in under 2s is normal. Requiring pending is why bodies never appear even when the hook fires.

**Alternatives considered**:

- Keep 2s + pending — continues to drop most API calls.
- Correlate by `webRequest.requestId` — the page hook cannot see it.
- Invent a row when nothing matches — violates 003 “do not invent a row.”

## D4 — Inject into already-open tabs

**Decision**: When recording crosses **off → on** (any profile), keep `registerContentScripts` for future documents **and** call `scripting.executeScript` on every already-open tab that is a normal web page:

- `tabs.query({})` then skip non-injectable URLs (`chrome:`, `edge:`, `about:`, `moz-extension:`, `chrome-extension:`, Chrome Web Store).
- Per tab: `allFrames: true`, `injectImmediately: true`.
- MAIN file `request-log-main.js` with `world: 'MAIN'`, then isolated `request-log-hook.js`.
- Hooks already no-op if installed (`__modheaderLogHookInstalled` / `__modheaderLogBridge`).
- Restricted pages: `executeScript` throws → catch and skip (response body may stay unavailable; allowed).
- When recording goes fully off: unregister content scripts only. Do **not** unpatch `fetch`/`XHR` on live pages. Background already ignores hook messages while recording is off.

No new permissions: `scripting`, `tabs`, and `<all_urls>` already ship.

**Rationale**: FR-018. `registerContentScripts` cannot retro-inject. `executeScript` is the supported path on Chrome and modern Firefox.

**Alternatives considered**:

- Reload every tab on Start — hostile and not required.
- `debugger.attach` — see D1.
- Inject only the active tab — rejected (clarification: already-open **tabs**, including embeds).

## D5 — Enhanced detail UI (no new packages)

**Decision**:

- Keep in-place single expand in `RequestLogList` (already wired via `expandedId`). Reset expand when leaving Requests, switching profile, clearing, or the id disappearing.
- Redesign `RequestLogDetail` into three labeled blocks: **Overview** (method, full URL, status, type, time), **Request** (headers + body + copy), **Response** (headers + body + copy).
- Display formatting: `formatBodyForDisplay(text)` in `lib/body-format.ts` — if the stored text parses as a JSON object or array, pretty-print with 2-space indent; otherwise show as captured. Copy uses **stored** text (`FR-010`).
- Copy body uses the existing snackbar path. Empty / binary / unavailable → “No text to copy.” Truncated → mention truncated.
- Collapsed row stays the 004 one-line scan (method, status, type, truncated URL, cURL). Open state is `aria-expanded` plus a contained detail; no second navigation surface.

**Rationale**: Spec US1–US3. JSON pretty-print is a few lines; no highlighter dependency (Principle III / IV).

**Alternatives considered**:

- Tabs (Headers / Payload / Response) like DevTools — heavier in a 720px popup; grouped stacks are enough.
- Raw/formatted toggle — out of scope (assumption).
- Remember expand across popup reopen — contradicted by FR-006.

## D6 — Permissions and constitution

**Decision**: No new permissions, no new npm packages, no profile-schema change, no `debugger`.

**Rationale**: Capture reach expands using APIs already justified in 003 (D7). Constitution I–IV stay green.

## D7 — Tests

**Decision**:

- Unit: `pickEntryForBody` on completed rows; reject already-filled text bodies; relative→absolute sanitize; `formatBodyForDisplay`; request-body serialize helpers if extracted.
- Unit: `preferBody` still upgrades `empty`/`unavailable` to `text`.
- e2e (Chromium, existing `echoServer`): open a page **first**, then Start recording (no reload), `fetch` POST JSON, expand the row, assert request and response body text, copy body, copy cURL still does not expand.

**Rationale**: Principle V. SC-009 is the regression that 003’s e2e never covered (it opened a **new** page after Start, which hid the inject gap).
