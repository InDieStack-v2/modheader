# Quickstart: WebSocket Capture Tab

## Prerequisites

- `npm install`. This adds `@msgpack/msgpack` (runtime, popup only) and `ws` (devDependency, for the e2e echo server).
- `npm run dev` (Chrome) or `npm run dev:firefox`.

## Automated checks

```sh
npm run test        # ws-decode, session-log socket ops, observer binding
npm run test:e2e    # tests/e2e/websocket.spec.ts
npm run lint && npm run compile
```

Expected unit coverage:
- `tests/unit/ws-decode.test.ts`: `autoView` for JSON text, plain text, a MessagePack map, a MessagePack scalar (→ Hex), and random bytes (→ Hex); every view on text and binary, including "cannot decode" results; Base64 text round trip; truncated input.
- `tests/unit/session-log.test.ts`: `sockets` kept in step through reorder, drop, insert and ensureSlots; `clearSockets` leaves `entries`, `recording` and `wsRecording` alone; `wsRecording` is independent of `recording`, follows reorder/drop/insert, and pause clears both; caps (50 / 500) and the 2 MB trim order set `droppedMessages`.
- `tests/unit/request-match.test.ts` (or observer test): hook binding picks the newest unbound row with the same tab and URL within 10 s, and ignores rows outside the window.

## Manual / e2e scenarios

The e2e fixture adds a `ws` echo server on `127.0.0.1:<port>` that records the upgrade request headers and echoes every message, text or binary, back to the client.

| # | Steps | Expected |
|---|-------|----------|
| 1 | Profile has request header `X-Test: 1` and no filters. Open the popup | Tabs read Headers · Logs · WebSockets, with Headers selected |
| 2 | Start recording **on the WebSockets tab**. Open the fixture page, which connects to `ws://127.0.0.1:<port>` | The WebSockets tab shows one row, `open`. The echo server saw `X-Test: 1`. The **Logs** tab has no row for it (FR-003) |
| 3 | Page sends `{"a":1}`, `hello`, and 3 bytes `01 02 03` | Detail shows 6 messages in order (↑↓ pairs). JSON opens pretty-printed, `hello` opens as Text, the bytes open as Hex `01 02 03` |
| 4 | Page sends MessagePack bytes of `{"x":[1,2]}` | Opens in the MessagePack view as `{"x": [1, 2]}`. Switching to Base64 shows `gaF4kgEC` |
| 5 | Page sends the text `aGVsbG8=` and the user picks Base64 | Shows `hello` |
| 6 | Pick MessagePack on the `hello` message | "Cannot decode as MessagePack" notice, and Text is still reachable |
| 7 | Keep the popup open while the page sends a message every 500 ms | New rows appear within 2 s (SC-003) |
| 8 | Page closes with code 4001 and reason "bye" | Row reads `closed 4001`, detail shows the reason, and messages remain |
| 9 | Pause WebSocket recording, then the page opens a new socket and sends messages | Nothing new is captured; the old data is still there |
| 9b | With only WebSocket recording on, the page makes an HTTP request; then start Logs recording and pause it again | The HTTP request is not logged until Logs recording starts. Starting or pausing Logs never changes WebSocket recording, and the status chip reads `Recording WS` / `Recording Logs+WS` accordingly |
| 10 | Clear on the WebSockets tab | Socket rows are gone, the Logs rows and both recording states are unchanged |
| 11 | Profile type filter set to XHR only; record and open a socket | Not captured. Add WebSocket to the filter → captured |
| 12 | Page sends 600 messages | The detail keeps the last 500 and shows "Earlier messages were dropped". Opening the connection takes under 1 s |
| 13 | Restart the browser | The WebSockets tab is empty and both recordings are off |

Run scenarios 1–8 and 13 in **both** Chrome and Firefox before release sign-off (Principle II, V).

See [contracts/ws-hook-messages.md](contracts/ws-hook-messages.md) and [contracts/ui-components.md](contracts/ui-components.md) for the behaviour each step checks.
