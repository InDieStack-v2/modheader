# Implementation Plan: WebSocket Capture Tab

**Branch**: `006-websocket-capture-tab` | **Date**: 2026-09-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/006-websocket-capture-tab/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Add a third profile tab, **WebSockets**. It lists the WebSocket connections the recording profile patched, with their handshake headers and messages, and shows each message as Text / JSON / Hex / Base64 / MessagePack, choosing the first view automatically.

Approach: route `webRequest` events of type `websocket` out of the HTTP log into a new session-only `sockets` store (R1). Extend the existing MAIN-world hook to wrap `WebSocket` and post open / message / close events, with binary encoded as Base64 (R2, R4). Bind those events to the webRequest row by tab, URL and a 10 s window (R3). Batch message writes every 250 ms under a separate 2 MB budget (R5). Decode in a pure popup module, using `@msgpack/msgpack` for MessagePack (R6). Recording is independent per tab: a new per-profile `wsRecording` flag beside `recording`. Profile index bookkeeping and the browser-restart reset reuse the 003 request-log machinery (R8).

## Technical Context

**Language/Version**: TypeScript ~5.9.3 (strict), React 19.2; plain JS for the `public/` page hooks

**Primary Dependencies**: WXT 0.21, MUI 9.2, `wxt/browser`. **New**: `@msgpack/msgpack` (runtime, popup only) and `ws` (devDependency, e2e echo server only)

**Storage**: `storage.session` (local fallback wiped on startup) with a new key `requestLogSockets`. The HTTP log budget goes from 8 MB to 7 MB and the new socket budget is 2 MB, under the 10 MB session quota

**Testing**: Vitest for `ws-decode`, session-log socket ops and hook binding. Playwright `tests/e2e/websocket.spec.ts` against a `ws` echo fixture

**Target Platform**: Chrome MV3 and Firefox MV3

**Project Type**: browser extension (popup + background observer + page hook)

**Performance Goals**: new messages visible within 2 s (250 ms flush + `onChanged`); opening a 500-message connection in under 1 s (only expanded messages decode)

**Constraints**: no new permissions (`webRequest` and `scripting` are already granted); no `debugger` API; worker-created sockets have no message capture (explicit UI state); caps of 50 connections, 500 messages and 64 KB per message

**Scale/Scope**: 1 new lib module and 2 new components; changes to the hook JS, observer, session-log, types, resource-types, toggles and App tabs. No profile schema change

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Modern Build Toolchain | Same WXT build. Hook stays static in `public/`; msgpack is bundled into the popup, nothing fetched at runtime | ✅ PASS |
| II. Cross-Browser Compatibility | webRequest `websocket` type, DNR `websocket` resource type and MAIN-world injection exist in both. Unverified close semantics after 101 are handled browser-neutrally (R1) | ✅ PASS (spike task confirms both) |
| III. Simplicity & Minimal Change | Reuses the observer, hook, session-log arrays and `formatBodyForDisplay`; one extra boolean array for WebSocket recording. One new pure module, two components | ✅ PASS |
| IV. Managed Dependencies | `@msgpack/msgpack`, justified in R6 (correct decoding of every format family); `ws`, dev only. Both maintained and lockfile-pinned | ✅ PASS (justified) |
| V. Test Discipline | Unit tests for decode, store ops and binding; e2e for the capture flow; manual matrix in quickstart | ✅ PASS |
| Constraint: runtime state survives worker restarts | Socket binding (`hookKey`) is stored on the row. Only the ≤250 ms flush buffer is in memory | ✅ PASS (constitution 2.1.0 allows ≤1 s write coalescing for high-rate capture) |

**Gate result**: PROCEED.

**Post-Phase-1 re-check**: the design adds one session key and no new permissions, and keeps dumps and backups untouched. The 250 ms flush buffer sits inside the constitution 2.1.0 exception (≤1 s). No violations.

## Project Structure

### Documentation (this feature)

```text
specs/006-websocket-capture-tab/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── ws-hook-messages.md
│   └── ui-components.md
└── tasks.md              # /speckit-tasks, not created here
```

### Source Code (repository root)

```text
public/
├── request-log-main.js      # + WebSocket subclass: open/message/close/error, Base64, 64 KB cap
└── request-log-hook.js      # forward 'modheader:ws' messages

lib/
├── types.ts                 # + WsConnectionEntry, WsMessage; RequestLogState.sockets
├── session-log.ts           # + sockets key/pad/remap/drop/insert, clearSockets,
│                            #   appendWsMessages (250 ms coalesced), 2 MB trim; HTTP 8→7 MB
├── request-log-observer.ts  # route type==='websocket' to the socket store; handle 'modheader:ws'
├── request-match.ts         # + pickSocketForHook (tab + URL + 10 s, newest unbound)
├── resource-types.ts        # + websocket type; logs-mode list leaves it out
└── ws-decode.ts             # NEW: autoView, decode (text/json/hex/base64/msgpack)

components/
├── ResourceTypeToggles.tsx  # hide websocket in logs mode
├── WebSocketList.tsx        # NEW
└── WebSocketDetail.tsx      # NEW

entrypoints/popup/App.tsx    # third tab, wiring, expand reset

tests/unit/
├── ws-decode.test.ts        # NEW
├── session-log.test.ts      # socket ops, caps, trim
├── request-match.test.ts    # pickSocketForHook
└── resource-types.test.ts   # websocket in capture, not in logs

tests/e2e/
├── fixtures.ts              # + ws echo server
└── websocket.spec.ts        # NEW: quickstart scenarios 1–12
```

**Structure Decision**: stay in the existing WXT layout. Capture extends the 003 hook and observer; storage extends `session-log.ts`; presentation is two components next to `RequestLogList` and `RequestLogDetail`. No new entrypoints.

## Complexity Tracking

> No constitution violations to justify. The ≤250 ms socket-message flush buffer (research R5) is covered by the constitution 2.1.0 write-coalescing exception.
