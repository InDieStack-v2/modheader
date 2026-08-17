# Research: Profile Request Logs

**Date**: 2026-08-17 | **Feature**: `003-profile-request-logs`

## D1 — How to know a request was patched

**Decision**: Replicate the DNR compile predicate in JS (`profileWouldPatch`). A request is logged iff recording is on for that profile, the profile is the active (selected) one, the extension is not globally paused, tab-lock matches, the URL/type pass the profile's enabled filters (same OR-in-group / AND-across-groups rules as `compileProfileToRules`), and at least one enabled, non-denied header rule exists.

**Rationale**: DNR “modifies without viewing content.” `onRuleMatchedDebug` is unpacked-only. `getMatchedRules` is quota-limited (20 / 10 min, 5-minute window) and is not a live stream. The popup already compiles the same rules; sharing the predicate keeps log membership aligned with what we actually install.

**Alternatives considered**:
- `onRuleMatchedDebug` — store builds cannot use it.
- `getMatchedRules` polling — too coarse and rate-limited for live 2s updates.
- Log every `webRequest` and filter in the UI — violates FR-009 and wastes quota.

## D2 — Observing post-modification headers, method, type, status

**Decision**: Non-blocking `webRequest` listeners, registered only while at least one profile is recording:

| Event | Extra | Use |
|-------|--------|-----|
| `onBeforeRequest` | `requestBody` | Open a pending entry; capture request body |
| `onSendHeaders` | `requestHeaders`, `extraHeaders` | Request-header snapshot |
| `onHeadersReceived` | `responseHeaders`, `extraHeaders` | Response-header snapshot + status |
| `onCompleted` / `onErrorOccurred` | — | Final status / failed |

Merge rule for the snapshot (so “after this profile’s modification” holds even if a browser hides DNR edits): start from observed headers; for each enabled profile rule, **set** or **remove** that name from the snapshot (do not re-append). Other observed headers stay. `Cookie` / `Authorization` / `Set-Cookie` require Chrome `extraHeaders`.

**Rationale**: Observe-only `webRequest` is allowed on Chrome MV3 (blocking is not). Status is on `onHeadersReceived` / `onCompleted`. Host access is already `<all_urls>`.

**Alternatives considered**:
- `debugger` + Network domain — full bodies, but yellow infobar, breaks DevTools, store-review risk. Rejected (YAGNI + Principle III).
- DNR only — cannot read headers or bodies.

## D3 — Request and response bodies

**Decision**:
- **Request body**: `onBeforeRequest` `requestBody` (`formData` or raw). Decode UTF-8; if not valid text → `kind: 'binary'`. Truncate text at 64 KB with `truncated: true`.
- **Response body**: available only for page `fetch` / `XMLHttpRequest`. While recording, `scripting.registerContentScripts` injects a MAIN-world hook (`entrypoints/request-log-hook.ts`) on `<all_urls>`. The hook posts `{ method, url, body, startedAt }` to the isolated/background path. Background attaches the body to **at most one** pending log row: same method + `sanitizeLogUrl(url)`, `startedAt` within 2s, no response body yet; if several match, oldest `startedAt` then lowest `id`. Unmatched or non-XHR rows show the FR-023 not-available state.
- Unregister the content script when no profile is recording.

**Rationale**: Chrome MV3 `webRequest` never exposes response payloads (`onResponseStarted` is a signal only). Firefox `filterResponseData` is Firefox-only and would split the design. A MAIN-world hook is the one path that works on both browsers for the “API” case the user cares about. Spec FR-023 already allows empty/not-available.

**Alternatives considered**:
- Firefox-only `filterResponseData` — breaks Principle II.
- Always-injected content script — unnecessary when recording is off.
- `debugger` — see D2.

## D4 — Session lifetime (popup close vs browser restart)

**Decision**: Store recording flags and entries in `browser.storage.session` (10 MB quota, Chrome 102+ / Firefox 115+). It is not written to disk, is recommended for service workers, and is cleared when the browser restarts — exactly FR-013. Subscribe the popup via `storage.onChanged` (`areaName === 'session'`) for live updates.

Fallback: if `storage.session` is missing, use `storage.local` keys prefixed `requestLog:` and delete them in `runtime.onStartup` (fires on browser start, not worker idle).

**Rationale**: Constitution forbids in-memory-only state (worker can die mid-recording). `storage.local` would survive browser restart unless we wipe it. `storage.session` matches the spec without a generation token.

**Alternatives considered**:
- JS memory in the worker — dropped on idle kill.
- `storage.local` without wipe — violates “reset on browser restart.”

## D5 — Quota vs 200 × 64 KB bodies

**Decision**: Soft cap 200 entries per profile (FR-017). Before each write, estimate size; if the session store would exceed ~8 MB (margin under 10 MB), drop oldest entries across that profile first. A single entry’s bodies still truncate at 64 KB each.

**Rationale**: 200 × 128 KB bodies ≈ 25 MB, over quota. Eviction is already specified (“older entries drop off silently”). Prefer keeping more metadata-only rows over refusing the write.

## D6 — Profile identity without changing Profile documents

**Decision**: Key session maps by **profile index** (same identity the rest of the app uses). `remapLogsOnReorder(from, to)` and `dropLogAt(index)` (shift higher indices down) run in the same popup path that already reorders/deletes profiles. Duplicate → new index starts recording-off / empty log. FR-020 honored: no fields added to exported `Profile`.

**Rationale**: Profiles have no stable id today. Adding one would change stored profile documents.

## D7 — New permissions

**Decision**: Add `webRequest` and `scripting`. Do **not** add `webRequestBlocking`, `declarativeNetRequestFeedback`, `debugger`, or `unlimitedStorage`.

| Permission | Why |
|------------|-----|
| `webRequest` | Observe method/URL/type/status/headers/requestBody of patched requests while recording |
| `scripting` | Register/unregister the MAIN-world hook only while recording |

`host_permissions: <all_urls>` already present.

**Rationale**: Constitution: additions must be justified and minimized. Both are unused when recording is off (listeners still declared, but hook unregistered; we no-op in the listener if nothing is recording).

## D8 — cURL

**Decision**: Pure `toCurl(entry)` in `lib/curl.ts`. Emit `curl -X <METHOD> '<url>'` plus `-H` for each request header (real values) and `--data-raw` for a stored text request body. Omit response body. If request body is binary/missing, omit `--data-raw` and return `{ command, bodyOmitted: boolean }`. Clipboard via `navigator.clipboard.writeText` in the popup; snackbar confirms (existing pattern).

**Rationale**: First-party, unit-testable, no dependency. Matches FR-025 and clarification “after modification, secrets in full.”

## D9 — Live popup updates

**Decision**: Background writes session storage; popup `subscribeSessionLog` on `storage.onChanged`. No long-lived port required. 2s budget is comfortable for a storage round-trip.

**Rationale**: Same pattern as `subscribeRuntimeState`. Ports die when the popup closes; storage is what must persist anyway.

## D10 — UI placement

**Decision**: MUI `Tabs` in the workspace under the existing compact toolbar: **Headers** | **Logs**. Recording chip in the existing status row (next to Pause / Tab lock), visible from Headers (FR-022). Copy-cURL is an icon button on the collapsed row. Default tab is Headers on popup open and on profile switch (FR-002).

**Rationale**: Matches spec and 002 compact chrome. No new layout system.
