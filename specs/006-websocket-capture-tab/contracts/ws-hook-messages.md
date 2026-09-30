# Contract: WebSocket hook messages (page → background)

The MAIN-world hook `public/request-log-main.js` posts these to `window`. The isolated bridge `public/request-log-hook.js` forwards them to `chrome.runtime.sendMessage` unchanged. `lib/request-log-observer.ts` handles them. The background derives the tab and frame from `sender` and never trusts ids sent from the page for that.

All messages share this shape:

```ts
{ type: 'modheader:ws', event: WsHookEvent, socketId: number, at: number, ... }
```

`socketId` is a per-page counter. The background key is `"<sender.tab.id>:<sender.frameId>:<socketId>"`.

| event | Extra fields | Background effect |
|-------|--------------|-------------------|
| `open` | `url: string` (absolute) | Bind to the newest unbound WebSocket row with the same tab, the same sanitized URL and `startedAt` within 10 s. Set `hookKey`, `messagesObserved = true`, `state = 'open'`. No match: ignore this socket |
| `message` | `seq: number`, `dir: 'sent' \| 'received'`, `kind: 'text' \| 'binary'`, `data: string` (Base64 when binary), `size: number`, `truncated?: boolean` | Append to the bound row (coalesced flush, 250 ms). No bound row: drop |
| `close` | `code: number`, `reason: string` | `state = 'closed'`, set `closeCode` and `closeReason` |
| `error` | — | If still `connecting`, `state = 'failed'`; otherwise ignore (a `close` follows) |

## Rules

- The hook caps raw content at 65 536 (text characters or bytes) **before** Base64 and sets `truncated`. `size` is always the original size.
- `seq` is assigned when the event happens, not when it is posted, so Blob reads (`binaryType = 'blob'`) can't reorder messages. The background sorts by `seq` when appending.
- A `sent` message is recorded only when `send()` doesn't throw (a socket in `CONNECTING` state throws).
- Events for rows whose profile has `wsRecording` off are dropped (FR-008; pausing WebSocket recording stops appends while earlier messages stay). `recording` (request log) has no effect here.
- The subclass must keep `instanceof WebSocket`, static constants, `binaryType`, `protocol` and `extensions` behaviour. Hook failures must never throw into page code (every post is wrapped in try/catch, same as the fetch/XHR hook).
