# Data Model: WebSocket Capture Tab

All new data is **session-only** (`storage.session`, or the `storage.local` fallback wiped on startup), next to the existing request log. Profiles, dumps and cloud backups don't change.

## WsConnectionEntry (new, `lib/types.ts`)

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | webRequest `requestId` of the handshake |
| `profileIndex` | `number` | Owning profile slot |
| `tabId` | `number` | From webRequest; used to bind hook sockets (R3). `-1` if not from a tab |
| `startedAt` | `number` | ms epoch, at `onBeforeRequest` |
| `url` | `string` | `sanitizeLogUrl` (origin + path + query; no userinfo or fragment) |
| `state` | `'connecting' \| 'open' \| 'closed' \| 'failed'` | See state machine |
| `closeCode?` | `number` | From hook `ws-close` |
| `closeReason?` | `string` | From hook `ws-close`; may be `''` |
| `requestHeaders` | `NameValue[]` | Post-modification handshake headers (`overlayHeaderRules`), unredacted |
| `responseHeaders?` | `NameValue[]` | 101 response headers, if seen |
| `hookKey?` | `string` | `"<tabId>:<frameId>:<socketId>"` once bound (R3) |
| `messagesObserved` | `boolean` | `true` once bound to a page hook. `false` + `open`/`closed` means "messages not available" |
| `messages` | `WsMessage[]` | Oldest first, at most 500 |
| `droppedMessages` | `boolean` | `true` once any older message was trimmed |

**List order**: newest connection first in `sockets[profileIndex]`, capped at 50.

### State machine

```text
connecting --(webRequest 101 | hook ws-open)--> open
connecting --(webRequest onErrorOccurred | hook ws-error before open)--> failed
open       --(hook ws-close)--> closed (closeCode, closeReason)
open       --(webRequest onCompleted/onErrorOccurred)--> open   (ignored after 101, R1)
closed/failed: terminal
```

Merging keeps the furthest state: `connecting < open < closed`; `failed` applies only from `connecting`.

## WsMessage (new)

| Field | Type | Notes |
|-------|------|-------|
| `seq` | `number` | Per-socket sequence from the hook; ordering key |
| `at` | `number` | ms epoch |
| `dir` | `'sent' \| 'received'` | |
| `kind` | `'text' \| 'binary'` | |
| `data` | `string` | Text content, or Base64 of the bytes for `binary` |
| `size` | `number` | Original size: UTF-8 bytes for text, byte length for binary (before truncation) |
| `truncated?` | `boolean` | `true` when the content was cut at 64 KB of raw content |

## RequestLogState (extended)

```ts
interface RequestLogState {
  recording: boolean[];          // request-log recording
  wsRecording: boolean[];        // NEW, key: 'requestLogWsRecording'; WebSocket recording, independent
  entries: RequestLogEntry[][];
  typeFilter: string[][];
  sockets: WsConnectionEntry[][];   // NEW, key: 'requestLogSockets'
}
```

- Every per-profile array operation (`pad`, `ensureSlots`, `remapOnReorder`, `dropAt`, `insertSlot`) covers `sockets` and `wsRecording` too.
- `anyRecording` = `recording` or `wsRecording` (page hook install, toolbar badge). Global pause and "no enabled rules" clear both flags.
- `clearEntries(i)` leaves `sockets[i]` alone, and `clearSockets(i)` (new) leaves `entries[i]`, `recording[i]` and `wsRecording[i]` alone. Neither clear changes a recording flag.
- Budgets: HTTP entries 7 MB (was 8 MB); sockets 2 MB, 50 connections per profile, 500 messages per connection, 64 KB of raw content per message.

## Decoded view (popup-only, not stored)

```ts
type WsView = 'text' | 'json' | 'hex' | 'base64' | 'msgpack';
type DecodeResult = { ok: true; text: string } | { ok: false; reason: string };
```

Auto-detect rules are in [research.md R6](research.md#r6-decoding-views-fr-014--fr-015). The selected view is React state for each open message only (not remembered).

## ResourceType list (changed)

`STANDARD_RESOURCE_TYPES` gains `websocket` (label `WebSocket`, short label `WS`). It is shown in the profile filter and hidden from the Logs type filter.
