# Tasks: WebSocket Capture Tab

**Input**: Design documents from `/specs/006-websocket-capture-tab/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: REQUIRED. Constitution Principle V says `lib/` logic needs unit tests and major flows need e2e tests, written before or alongside the implementation.

**Organization**: grouped by user story (spec.md): US1 tab + connection list (P1), US2 messages + decoded views (P1), US3 independent recording control + clear (P2).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on unfinished tasks)
- **[Story]**: US1 / US2 / US3

---

## Phase 1: Setup

- [X] T001 Add `@msgpack/msgpack` to `dependencies` and `ws` + `@types/ws` to `devDependencies` in package.json via `npm install @msgpack/msgpack && npm install -D ws @types/ws`. Confirm neither package is deprecated or end-of-life (`npm view <pkg> deprecated time.modified`), and commit package-lock.json
- [X] T002 [P] Add a `ws` echo server to tests/e2e/fixtures.ts. Expose `wsUrl` and `lastUpgradeHeaders`, echo every text or binary frame back unchanged, and close with the requested code and reason when it receives the text `__close:<code>:<reason>`. Serve an HTML page at `/ws-page` whose inline script exposes `window.openWs(url)`, `window.sendWs(data)` (string, or an array of bytes → Uint8Array) and `window.closeWs()`
- [X] T003 Spike: in Chrome and Firefox (`npm run dev` / `npm run dev:firefox` + the T002 page), log which `webRequest` events fire for a ws handshake (type, statusCode) and whether `onCompleted` / `onErrorOccurred` fire when an open socket later closes. Record the results under a "Spike results" heading at the end of specs/006-websocket-capture-tab/research.md (R1). If either browser doesn't report type `websocket`, stop and revisit the plan

---

## Phase 2: Foundational (blocks all stories)

- [X] T004 Add `WsMessage`, `WsConnectionEntry` (fields and state union exactly as in data-model.md) and `sockets: WsConnectionEntry[][]` on `RequestLogState` in lib/types.ts
- [X] T005 Write failing unit tests in tests/unit/session-log.test.ts: `sockets` stays in step through `ensureSlots`, `remapOnReorder`, `dropAt` and `insertSlot`; `getRequestLogState` defaults `sockets` to `[]`; `wipeLocalFallbackKeys` also removes `requestLogSockets`; `subscribeRequestLog` fires when only `requestLogSockets` changes
- [X] T006 Extend lib/session-log.ts: add `REQUEST_LOG_SOCKETS_KEY = 'requestLogSockets'`, and handle `sockets` in `getRequestLogState`, `writeState`, `pad`, `remapOnReorder`, `dropAt`, `insertSlot`, `wipeLocalFallbackKeys` and the `subscribeRequestLog` key check. Lower `MAX_BYTES` from 8 MB to 7 MB, and change `estimatedBytes` so it measures `entries` only (sockets get their own budget in T008). Make T005 pass
- [X] T007 Write failing unit tests in tests/unit/session-log.test.ts for `upsertSocket(profileIndex, entry)` and `appendWsMessages(profileIndex, hookKey, messages)`:
  - upsert merges by `id` with state precedence `connecting < open < closed`, and `failed` applies only from `connecting` (data-model.md state machine);
  - new connections go first, capped at 50;
  - appended messages sort by `seq`, capped at 500, and trimming sets `droppedMessages`;
  - when `JSON.stringify(sockets).length > 2 MB`, the oldest messages of the oldest connection go first, then whole oldest connections;
  - appending to an unknown `hookKey` does nothing
- [X] T008 Implement `upsertSocket`, `appendWsMessages`, `bindSocketHook(profileIndex, entryId, hookKey)` and `clearSockets(profileIndex)` in lib/session-log.ts. Serialize through the existing `writeChain`, and write only `requestLogSockets` (never rewrite HTTP entries). Make T007 pass
- [X] T009 [P] Write failing unit tests in tests/unit/resource-types.test.ts: `STANDARD_RESOURCE_TYPES` includes `{value:'websocket', label:'WebSocket', shortLabel:'WS'}`; `typeShortLabel('websocket') === 'WS'`; a new `resourceTypesFor('logs')` leaves out websocket and `resourceTypesFor('capture')` includes it
- [X] T010 [P] Add the websocket type and `resourceTypesFor(mode)` in lib/resource-types.ts. Make components/ResourceTypeToggles.tsx iterate `resourceTypesFor(mode)` instead of `STANDARD_RESOURCE_TYPES`. Make T009 pass

**Checkpoint**: the store and types are ready, and `npm run test` passes.

---

## Phase 3: User Story 1 - Dedicated WebSockets Tab (P1) 🎯 MVP

**Goal**: a third tab listing patched WebSocket connections (time, URL, state), never mixed into Logs.

**Independent Test**: profile with `X-Test: 1` and no filters, recording on, the fixture page opens a socket. WebSockets shows one `open` row, the echo server saw `X-Test: 1`, and Logs has no row for it (quickstart 1–2, 11).

### Tests for User Story 1

- [X] T011 [P] [US1] Create tests/e2e/websocket.spec.ts with quickstart scenarios 1, 2 and 11. Check the three tabs with Headers as the default; that the row appears with state `open` within 2 s; that `lastUpgradeHeaders['x-test'] === '1'`; that the Logs tab has no ws row; and that a profile type filter of XHR only captures nothing until WebSocket is added. Use the existing helpers in tests/e2e/helpers.ts and follow the style of tests/e2e/request-log.spec.ts

### Implementation for User Story 1

- [X] T012 [US1] In lib/request-log-observer.ts, branch on `details.type === 'websocket'` in every webRequest listener, before `ensureEntry`. First add `profilePatchesWebSocket(profile, input)` to lib/request-match.ts: true only when `profileWouldPatch(profile, {...input, resourceType:'websocket'})` **and** the profile has at least one enabled, non-denied, non-empty-named **request**-header rule (response-only profiles don't patch the handshake; spec edge case and Clarifications Q3). Write its unit cases in tests/unit/request-match.test.ts first: response-only profile → false; request rule + no filters → true; type filter without websocket → false; locked to another tab → false. Then build a `WsConnectionEntry` only when recording and `profilePatchesWebSocket(...)`: `id = requestId`, `tabId`, `startedAt`, `url = sanitizeLogUrl`, `state 'connecting'`, `messagesObserved false`, `messages []`, `droppedMessages false`. Then:
  - `onSendHeaders` sets `requestHeaders = overlayHeaderRules(observed, profile.headers)`;
  - `onHeadersReceived` with 101 sets `state 'open'` and `responseHeaders`;
  - `onErrorOccurred` sets `failed` only while `connecting`;
  - `onCompleted` or `onErrorOccurred` after `open` changes nothing (R1, T003 results).
  
  Keep a separate in-memory `pendingSockets` map like `pending`, persist through `upsertSocket`, and **never** call the HTTP `upsert` for websocket events (FR-003)
- [X] T013 [P] [US1] Create components/WebSocketList.tsx per contracts/ui-components.md. It has a toolbar with the same start/pause and clear controls as components/RequestLogList.tsx (copy that markup, no type filter). Each row shows time, a state chip (`connecting` / `open` / `closed <code>` / `failed`), the URL (ellipsized, full URL in `title`) and the message count; clicking a row calls `onExpand(id or null)`. It shows both FR-013 empty-state messages, and renders `children` (the detail) under the expanded row
- [X] T014 [US1] In entrypoints/popup/App.tsx:
  - widen `workspaceTab` to `'headers' | 'logs' | 'websockets'`;
  - add `<Tab value="websockets">` labelled `WebSockets`, or `WebSockets · rec` while recording;
  - initialise `logState.sockets` to `[]`;
  - render `<WebSocketList>` with the same `recording`, `canRecord` and `onToggleRecording` logic as RequestLogList, `connections = logState.sockets[profileIndex] ?? []`, and `onClear` calling `clearSockets(profileIndex)`;
  - add an `expandedSocketId` state that resets on profile switch, tab switch and clear (the same places `expandedLogId` resets)
- [X] T015 [US1] Run `npm run test:e2e -- websocket` until T011 passes in Chrome

**Checkpoint**: US1 works on its own. The connection list is live and Logs is clean.

---

## Phase 4: User Story 2 - Inspect Messages with Decoded Views (P1)

**Goal**: open a connection to see its handshake headers and ordered messages, each shown as Text / JSON / Hex / Base64 / MessagePack with the view picked automatically.

**Independent Test**: quickstart 3–8 and 12 against the echo fixture.

### Tests for User Story 2

- [X] T016 [P] [US2] Write tests/unit/ws-decode.test.ts. `autoView`: `{"a":1}` → json, `hello` → text, `"42"` (a JSON scalar) → text, Base64 of MessagePack `{"x":[1,2]}` (`gaF4kgEC`) → msgpack, MessagePack scalar byte `05` → hex, random bytes → hex. `decode` covers every view × {text, binary}:
  - hex of `01 02 03` → `00000000  01 02 03`;
  - base64 of binary returns the stored data; base64 of text `aGVsbG8=` → `hello`; base64 of `hello` → `{ok:false}`;
  - msgpack of `gaF4kgEC` → pretty JSON `{"x": [1, 2]}`; msgpack with trailing bytes → `{ok:false}`; msgpack on text → `{ok:false}`;
  - text view on invalid UTF-8 binary → `{ok:false}`;
  - a `Uint8Array` or `bigint` inside MessagePack renders as Base64 or a string
- [X] T017 [P] [US2] Write tests/unit/request-match.test.ts cases for `pickSocketForHook(sockets, {tabId, url, at})`. It returns the newest row with the same `tabId` and the same `sanitizeLogUrl` URL, no `hookKey`, and `|startedAt - at| <= 10_000`; it skips bound rows and rows outside the window; it returns `undefined` when nothing matches
- [X] T018 [US2] Extend tests/e2e/websocket.spec.ts with quickstart scenarios 3–8 and 12. Check message order and direction arrows, the auto view per message type, switching views (MessagePack → Base64 shows `gaF4kgEC`), the cannot-decode notice, live append within 2 s while the popup is open, `closed 4001` with reason `bye`, and 600 messages → 500 kept plus the "Earlier messages were dropped" notice

### Implementation for User Story 2

- [X] T019 [P] [US2] Create lib/ws-decode.ts exporting `WsView`, `DecodeResult`, `autoView(msg)` and `decode(msg, view)` per research.md R6:
  - Base64 ↔ bytes with `atob`/`btoa`; text ↔ bytes with `TextEncoder` and `TextDecoder('utf-8', {fatal:true})`;
  - hex lines of 16 bytes with an 8-digit hex offset;
  - JSON via `formatBodyForDisplay` from lib/body-format.ts (objects and arrays only, as today);
  - MessagePack via `decode` from `@msgpack/msgpack` with a replacer for Uint8Array, bigint and Date;
  - strict Base64 check, with URL-safe input normalized first.
  
  Never throw. Make T016 pass
- [X] T020 [P] [US2] Add `pickSocketForHook` to lib/request-match.ts. Make T017 pass
- [X] T021 [US2] In public/request-log-main.js, after the XHR hook, wrap `globalThis.WebSocket` with `class extends Orig` per contracts/ws-hook-messages.md:
  - a per-page `socketId` counter; the constructor calls `super(...args)`, then adds `open`, `message`, `close` and `error` listeners that post `{type:'modheader:ws', event, socketId, at, ...}` (`open` also carries `url: this.url`);
  - patch `send` on the subclass prototype: call `super.send` first, and post a `sent` message only if it didn't throw;
  - assign `seq` synchronously per socket before any await;
  - payloads: string → text; ArrayBuffer or typed array → bytes; Blob → `await arrayBuffer()`;
  - cap raw content at 65 536 characters or bytes before encoding, set `truncated`, and keep the original `size` (UTF-8 byte length for text via `TextEncoder`);
  - Base64-encode bytes in 32 KB chunks with `String.fromCharCode.apply` + `btoa`;
  - copy the static constants; wrap everything in try/catch so page code never sees an error
- [X] T022 [US2] In public/request-log-hook.js, also forward messages with `data.type === 'modheader:ws'`, spreading every field through `chrome.runtime.sendMessage`
- [X] T023 [US2] In lib/request-log-observer.ts, handle `modheader:ws` in the `runtime.onMessage` listener. The listener must now receive `(message, sender)`; build `hookKey = \`${sender.tab?.id}:${sender.frameId}:${socketId}\``. Only act when the owning profile is recording.
  - **open**: `pickSocketForHook(sockets[index], {tabId: sender.tab.id, url, at})`, then `bindSocketHook` and set `messagesObserved true` and `state 'open'`; with no match, remember the key in an in-memory `ignoredHooks` set.
  - **message**: push to an in-memory per-`hookKey` buffer and schedule a 250 ms flush that calls `appendWsMessages` for each buffered key.
  - **close**: flush that key's buffer first, then `upsertSocket` with `state 'closed'`, `closeCode` and `closeReason`.
  - **error**: set `failed` only if still `connecting`.
  
  Keep the existing HTTP body handling unchanged
- [X] T024 [P] [US2] Create components/WebSocketDetail.tsx per contracts/ui-components.md:
  - handshake request and response headers, rendered with the same header table markup as components/RequestLogDetail.tsx;
  - the dropped-messages notice, and the "not available" and "no messages yet" states;
  - the message list oldest first with ↑/↓, time, size, a 120-character preview (or `binary · N B`) and a truncated marker;
  - one expanded message at a time, showing a view `ToggleButtonGroup` (Text · JSON · Hex · Base64 · MessagePack) that starts at `autoView(msg)`, a monospace `decode()` output or reason notice, and a copy button that copies `msg.data` (the original)
- [X] T025 [US2] Render `<WebSocketDetail>` for the expanded connection inside `<WebSocketList>` from entrypoints/popup/App.tsx (or inside WebSocketList.tsx, matching how RequestLogList hosts RequestLogDetail)
- [X] T026 [US2] Run `npm run test && npm run test:e2e -- websocket` until T016–T018 pass

**Checkpoint**: US1 and US2 work. Messages are captured, decoded and live.

---

## Phase 5: User Story 3 - Independent Recording Control and Clearing (P2)

**Goal**: Logs and WebSockets each have their own start/pause control per profile (independent); clear on WebSockets affects only socket data; everything resets on browser restart.

**Independent Test**: quickstart 9, 10 and 13.

### Tests for User Story 3

- [X] T027 [P] [US3] (shared-toggle assertions superseded by T038) Extend tests/e2e/websocket.spec.ts. Starting recording from WebSockets shows `Logs · rec` on the Logs tab and vice versa. After pausing, new sockets and messages aren't captured while old ones stay. Clear on WebSockets removes the socket rows while HTTP Logs rows and recording state stay. Wiping session state (as tests/e2e/request-log.spec.ts simulates a browser restart) empties WebSockets and turns recording off
- [X] T028 [P] [US3] Add a unit test to tests/unit/session-log.test.ts: `clearSockets(i)` leaves `entries[i]`, `recording[i]` and `typeFilter[i]` unchanged, and `clearEntries(i)` leaves `sockets[i]` unchanged

### Implementation for User Story 3

- [X] T029 [US3] Verify, and fix where needed, that pausing stops hook appends: in lib/request-log-observer.ts, drop `modheader:ws` messages and discard any pending buffer for that profile when `recording[index]` is false at flush time. Deleting a profile (`dropAt`) and undoing it (`insertSlot`) leave empty socket slots through T006
- [X] T030 [US3] Run `npm run test && npm run test:e2e -- websocket` until T027–T028 pass

**Checkpoint**: all stories work on their own.

---

## Phase 6: Polish & Cross-Cutting

- [X] T031 [P] Update the README.md feature list with the WebSockets tab (capture, decoded views, and the worker-socket limitation)
- [X] T032 Run the full suite `npm run lint && npm run compile && npm run test && npm run test:e2e` and fix any regressions, especially in tests/e2e/request-log.spec.ts, which is affected by the 7 MB budget and by ws rows leaving Logs
- [ ] T033 Manual sign-off: run quickstart scenarios 1–8 and 13 in both Chrome and Firefox (`npm run dev:firefox`), and record the results in the change description (Principle II, V)

---

## Phase 7: Change 2026-09-30 - Independent Recording (FR-008, spec Clarifications)

- [X] T034 [P] [US3] Add failing unit tests in tests/unit/session-log.test.ts: `wsRecording` defaults off and is independent of `recording`; `anyRecording` is true for either flag; `wsRecording` follows `remapOnReorder` / `dropAt` / `insertSlot`; `clearSockets` and `clearEntries` leave both flags alone; pause clears both flags for every profile and "no rules" clears both for the selected profile only
- [X] T035 [US3] Implement in lib/types.ts and lib/session-log.ts: `RequestLogState.wsRecording`, key `requestLogWsRecording`, `setWsRecording`, handle it in `getRequestLogState` / `writeState` / `pad` / reorder / drop / insert / `wipeLocalFallbackKeys` / `subscribeRequestLog`; make `stopAllRecording` and `syncRecordingWithPatching` clear both flags and `anyRecording` count either. Make T034 pass
- [X] T036 [US3] In lib/request-log-observer.ts gate WebSocket handshake capture, hook binding, message flush and message append on `wsRecording` (HTTP paths keep `recording`). In entrypoints/background.ts show the toolbar badge recording state for either flag and re-sync the page hook when `requestLogWsRecording` changes
- [X] T037 [US3] In entrypoints/popup/App.tsx add `toggleWsRecording`; the WebSockets tab label/toggle use `wsRecording`, the Logs tab keeps `recording`; the status chip reads `Recording`, `Recording WS` or `Recording Logs+WS`
- [X] T038 [US3] Rewrite the "shared recording toggle" case in tests/e2e/websocket.spec.ts as independent toggles: WebSocket recording does not log HTTP requests, starting/pausing Logs leaves WebSocket recording on, chip labels correct
- [ ] T039 Re-run quickstart scenarios 2, 9, 9b, 10 and 13 in Chrome and Firefox as part of T033

---

## Dependencies & Execution Order

- **Setup (T001–T003)** → **Foundational (T004–T010)** → user stories.
- **US1 (T011–T015)** depends only on Foundational.
- **US2 (T016–T026)** depends on US1: it needs rows to bind to (T012) and the list to host the detail (T013–T014).
- **US3 (T027–T030)** depends on US1 and uses US2's hook path for the pause check (T029).
- **Polish** comes after all stories. **Phase 7** (T034–T039) is the 2026-09-30 independent-recording change; it builds on US3.

Within a phase: tests first (they must fail), then lib, then observer or hook, then UI, then the run task.

## Parallel Examples

```text
Setup:        T002 ∥ T003 (after T001)
Foundational: T009+T010 ∥ (T004 → T005 → T006 → T007 → T008)
US1:          T011 ∥ T013, then T012 → T014 → T015
US2:          T016 ∥ T017 ∥ T019 ∥ T020 ∥ T024; then T021 → T022 → T023 → T025 → T018 → T026
US3:          T027 ∥ T028, then T029 → T030
```

## Implementation Strategy

1. **MVP = Phase 1–3 (US1)**: connections show up in their own tab and Logs stops showing ws handshakes as "Other". This ships value on its own.
2. **+US2**: messages and decoded views, the main reason users capture sockets.
3. **+US3**: independent recording toggles and clear hardening, then Polish and the cross-browser sign-off.
