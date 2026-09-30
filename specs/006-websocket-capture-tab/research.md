# Research: WebSocket Capture Tab

**Feature**: 006-websocket-capture-tab | **Date**: 2026-09-29

## R1. Where connection metadata (URL, handshake headers, state) comes from

- **Decision**: Reuse the existing `webRequest` observer (`lib/request-log-observer.ts`). Events with `details.type === 'websocket'` are routed to a new WebSocket store instead of the HTTP log. `onSendHeaders` gives handshake request headers (with `extraHeaders`, as today). `onHeadersReceived` gives status `101`, which means the connection is `open`. `onErrorOccurred` **before** 101 means `failed`.
- **Rationale**: Both Chrome and Firefox report ws/wss handshakes through `webRequest` with type `websocket`, and `<all_urls>` covers ws/wss. The observer already builds post-modification header snapshots with `overlayHeaderRules`. `profileWouldPatch(profile, {resourceType: 'websocket', ...})` already answers "patched?" (FR-002).
- **Current bug this fixes**: handshakes are logged today as HTTP rows typed `other` (because `normalizeResourceType('websocket')` returns `'other'`). FR-003 requires moving them out of Logs.
- **Unverified**: whether each browser fires `onCompleted` or `onErrorOccurred` **after** a 101 when the socket later closes. **Handling**: once a row is `open`, later webRequest completion or error events never change its state. Close state comes only from the page hook (R2). The spike task in tasks.md checks both browsers with the e2e echo server.
- **Alternatives rejected**: the `debugger` API (Chrome-only, shows a warning banner, needs a new permission, breaks Principle II); a `webRequest` frame API (doesn't exist).

## R2. How messages are observed

- **Decision**: Extend the existing MAIN-world hook (`public/request-log-main.js`) to wrap `window.WebSocket` with a subclass (`class extends OrigWebSocket`) that:
  - assigns a per-page socket id, and posts `ws-open` on the `open` event (not on construction, so the webRequest row already exists when it binds);
  - posts `ws-message` for each received message (a `message` listener) and each sent message (a patched `send`). A sequence number is assigned synchronously, so async Blob reads can't reorder messages;
  - posts `ws-close` (code, reason) on `close`, and `ws-error` on `error`.
  
  The isolated bridge (`public/request-log-hook.js`) forwards the new message types unchanged.
- **Rationale**: The hook infrastructure is already there: registration while recording, injection into open tabs, and fallbacks on restricted pages. Subclassing keeps `instanceof WebSocket`, the static constants (`WebSocket.OPEN`) and `binaryType` behaviour intact.
- **Limits (spec edge case)**: sockets created in workers or service workers aren't hooked. Their rows come only from webRequest, and `messagesObserved` stays `false`, so the UI shows "messages not available".
- **Alternatives rejected**: `Proxy` on the constructor (more code for the same result); patching only `prototype.send` (misses received messages).

## R3. Binding hook sockets to webRequest rows

- **Decision**: On `ws-open`, the background looks for the **most recent** WebSocket row for the same profile that has the same `sender.tab.id`, the same sanitized URL, no `hookKey` yet, and `startedAt` within 10 s (the same window as `pickEntryForBody`). It sets `hookKey = "<tabId>:<frameId>:<socketId>"` and `messagesObserved = true` on that row. Later `ws-message` and `ws-close` events find their row by `hookKey`. No row found means the socket wasn't patched or recording was off, so its events are dropped.
- **Rationale**: `hookKey` is stored on the row in session storage, so binding survives a worker restart (Constitution: no in-memory-only state). It uses the same time-window pattern the body attach already relies on.

## R4. Transport encoding and storage format

- **Decision**: `chrome.runtime.sendMessage` and `storage.session` are both JSON, so binary payloads are Base64-encoded **in the MAIN hook** (with `btoa` over chunked `String.fromCharCode`). Each message stores `data: string` plus `kind: 'text' | 'binary'`, where binary `data` is Base64. The hook applies the 64 KB cap to the **raw** content (text UTF-16 length, or bytes) **before** encoding, and sets `truncated`.
- **Rationale**: one encoding path, no structured-clone assumptions across the runtime boundary, and the decoded views (R6) work straight from Base64.

## R5. Write throttling and storage budget

- **Decision**:
  - A new session key `requestLogSockets` holds `WsConnectionEntry[][]` (per profile, like `entries`).
  - WebSocket writes go through a **250 ms coalescing flush** in the background: messages collect in a per-profile pending list, then one `storage.session.set` runs per flush, using the existing serial `writeChain`. The popup sees updates within about 0.5 s, inside the 2 s budget (FR-007).
  - Budgets: HTTP log `MAX_BYTES` goes from 8 MB to **7 MB**, and the new WebSocket budget is **2 MB**. Together they stay under the 10 MB `storage.session` quota in both browsers.
  - Trimming order when the WebSocket budget or a cap is exceeded: drop the oldest messages of the oldest connection first (setting `droppedMessages = true`), then drop whole oldest connections. Hard caps: 50 connections per profile and 500 messages per connection.
- **Rationale**: Writing the whole state per message (today's HTTP pattern) would rewrite megabytes many times a second on a chatty socket. Keeping HTTP and WebSocket traffic under separate keys stops `onChanged` from re-reading HTTP entries on every socket flush.
- **Constitution note**: at most 250 ms of messages lives only in memory before a flush. A worker being killed in that window loses at most those messages. This is allowed by the constitution 2.1.0 write-coalescing exception (≤1 s).
- **Alternatives rejected**: one shared 8 MB budget (a chatty socket would push HTTP rows out); IndexedDB (doesn't reset on browser restart for free, and adds more code).

## R6. Decoding views (FR-014 / FR-015)

- **Decision**: add a pure module `lib/ws-decode.ts`:
  - **Text**: text as-is; binary is decoded as UTF-8 with `TextDecoder(fatal)`, else a "cannot decode as text" notice.
  - **JSON**: reuse `formatBodyForDisplay` from `lib/body-format.ts` (text only; also accepts binary that is valid UTF-8 JSON).
  - **Hex**: bytes (UTF-8 for text) as two-digit hex, 16 bytes per line with an offset column.
  - **Base64**: binary becomes the stored Base64 string. Text is checked against strict Base64 (`/^[A-Za-z0-9+/]*={0,2}$/`, or the URL-safe variant, length ≡ 0 mod 4 once padding is normalized). If valid, the result is shown as UTF-8 text, else as Hex. Otherwise it shows "cannot decode as Base64".
  - **MessagePack**: `decode()` from `@msgpack/msgpack` over the bytes, then `JSON.stringify(v, replacer, 2)`. The replacer turns `Uint8Array` into Base64, `bigint` into a string, and `Date` into ISO. Trailing bytes or an invalid format show "cannot decode as MessagePack".
  - **Auto-detect**: text that parses as a JSON object or array opens as JSON, else Text. Binary opens as MessagePack only when the **whole** message decodes **and** the result is a map or array, else Hex. (A bare scalar is rejected because any single byte 0x00–0x7F is a valid MessagePack integer, which would mislabel most small binary frames.)
- **Dependency**: `@msgpack/msgpack` (the official MessagePack implementation for JS, maintained, no runtime deps, lockfile-pinned). It is imported only by the popup (`lib/ws-decode.ts`), not by the page hook or the background. Justification (Principle IV): a correct decoder covers about 20 format families (fixext, ext, timestamp, int64, float32), which a hand-written one would get wrong on edge cases. Check at install time that it is not end-of-life.
- **Alternatives rejected**: a hand-rolled decoder (roughly 100 lines plus a large test matrix for less correctness); `Uint8Array.prototype.toBase64` / `toHex` (newer than the extension's supported browser range and would need a fallback anyway, so `atob` / `btoa` is the single path).

## R7. Type filter changes

- **Decision**: add `{ value: 'websocket', label: 'WebSocket', shortLabel: 'WS' }` to `STANDARD_RESOURCE_TYPES`. `ResourceTypeToggles` in `mode === 'logs'` leaves out `websocket` (the HTTP log never holds it); in `mode === 'capture'` (the profile filter) it shows it.
- **Rationale**: FR-002(a) says a type-filtered profile captures sockets only when the filter includes WebSocket. DNR already supports resource type `websocket` in both browsers, and a profile **without** type filters already patches WebSocket handshakes (DNR's default covers every type except `main_frame`), so no change to `compileProfileToRules` is needed.

## R8. Recording, lifecycle and profile index bookkeeping

- **Decision** (updated 2026-09-30, spec Clarifications: recording is independent per tab): a new per-profile `wsRecording: boolean[]` (session key `requestLogWsRecording`) sits beside `recording[]`. `recording[]` keeps gating the HTTP log exactly as in feature 003; `wsRecording[]` gates only WebSocket rows, hook binding, and message appends. `setWsRecording` is the new toggle.
- The WebSocket store sits alongside the other `RequestLogState` arrays: `pad`, `remapOnReorder`, `dropAt`, `insertSlot`, `ensureSlots`, `wipeLocalFallbackKeys` and `subscribeRequestLog` handle `sockets` and `wsRecording`.
- `anyRecording(state)` is true when either flag is on. It decides whether the page hook is installed and whether the toolbar badge shows recording.
- Idle rule: `stopAllRecording` (global pause) and `syncRecordingWithPatching` (no enabled rules) switch both flags off.
- `clearSockets(i)` and `clearEntries(i)` change neither flag. Dump, export and cloud backup never read session keys, so FR-010 needs no work there.
- **Rejected**: one shared flag (the original design), because a chatty socket forces HTTP capture on, and the reverse.

## Spike results (T003, 2026-09-29)

**Chrome** (Playwright Chromium, built extension, `ws` echo fixture): a single socket that opened, sent one message and was closed by the server with 4001/"bye" produced exactly these `webRequest` events, all with `type: 'websocket'`, the `ws://` URL and the page `tabId`:

| Event | statusCode | When |
|-------|------------|------|
| onBeforeRequest | — | handshake |
| onSendHeaders | — | handshake |
| onHeadersReceived | 101 | handshake |
| onResponseStarted | 101 | handshake |
| onCompleted | 101 | **at handshake**, not at close |

Nothing fires when the socket closes, and no `onErrorOccurred`. This confirms R1: 101 means `open`, events after `open` are ignored, and the close state comes only from the page hook.

**Firefox**: Playwright can't load MV3 extensions into Firefox (see tests/e2e/fixtures.ts), so this is left to the manual sign-off in T033. Firefox's `webRequest` also reports `type: 'websocket'` for handshakes, and the design copes whether or not Firefox fires `onCompleted` or `onErrorOccurred` after 101.
