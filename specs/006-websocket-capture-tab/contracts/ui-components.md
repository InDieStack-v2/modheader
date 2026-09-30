# Contract: UI components

## App.tsx workspace tabs

- `workspaceTab: 'headers' | 'logs' | 'websockets'`, default `'headers'`, and reset to `'headers'` on profile switch (as today).
- The third `<Tab value="websockets">` label reads `WebSockets`, or `WebSockets · rec` while `wsRecording[profileIndex]`. The Logs label keeps using `recording[profileIndex]`.
- It renders `<WebSocketList>` with its **own** `recording={wsRecording}` and `onToggleRecording={toggleWsRecording}` (independent of `RequestLogList`, FR-008); `canRecord` uses the same pause / has-rules rule for both.
- The compact status chip shows `Recording` (Logs only), `Recording WS` (WebSockets only) or `Recording Logs+WS` (both), and is hidden when neither is on.

## `components/WebSocketList.tsx` (new)

```ts
interface WebSocketListProps {
  recording: boolean;
  canRecord: boolean;
  connections: WsConnectionEntry[];
  onToggleRecording(): void;
  onClear(): void;                 // → clearSockets(profileIndex)
  expandedId: string | null;       // one connection open at a time
  onExpand(id: string | null): void;
}
```

- Toolbar: the same start/pause control and clear button as `RequestLogList`. There is no type filter.
- Row: time · state chip (`connecting` / `open` / `closed 1000` / `failed`) · URL (ellipsized, with the full URL in the title) · message count.
- Empty states (FR-013): if not recording and there are no rows, show "Start recording to capture WebSocket connections this profile patches". If recording and there are no rows, show "Waiting for patched WebSocket connections…".

## `components/WebSocketDetail.tsx` (new)

- **Handshake**: the request headers table (unredacted), plus the response headers if present.
- **Messages**: oldest first. Each row shows ↑ sent / ↓ received, time, size, and a one-line preview (text: first 120 characters; binary: `binary · N B`). Rows mark `truncated`.
- When `droppedMessages` is set, a notice at the top says "Earlier messages were dropped".
- When `!messagesObserved` and the state isn't `connecting`, show "Messages not available for this connection (opened outside the page, e.g. a worker)". When observed with zero messages, show "No messages yet".
- Expanding a message shows view toggles `Text · JSON · Hex · Base64 · MessagePack`. The initial view is `autoView(msg)`; switching is local state. The body is `decode(msg, view)`: either the content in a monospace block, or the `reason` notice with the original still reachable through the Text/Hex views. A copy button copies the **original** content (text, or Base64 for binary; FR-006).
- Only expanded messages decode, so list rendering stays cheap at 500 messages (SC-004).

## `lib/ws-decode.ts` (new, pure)

```ts
export function autoView(msg: WsMessage): WsView;
export function decode(msg: WsMessage, view: WsView): DecodeResult;
```

## `ResourceTypeToggles`

- In `mode === 'logs'` it leaves out `websocket`; in `mode === 'capture'` it lists every type in `STANDARD_RESOURCE_TYPES`.
