# Feature Specification: WebSocket Capture Tab

**Feature Branch**: `006-websocket-capture-tab`

**Created**: 2026-09-29

**Status**: Draft

**Input**: User description: "I want to support capture websocket in separate tab"

## Clarifications

### Session 2026-09-29

- Q: Where should the WebSocket capture appear: as a third tab inside the popup, or as its own full browser tab? → A: A third tab in the popup's profile area (Headers, Logs, WebSockets)
- Q: Should WebSocket capture use the same start/pause recording button as the Logs tab, or have its own button? → A: Shared: one start/pause button per profile records both HTTP requests and WebSockets *(superseded 2026-09-30, see below)*
- Q: Should the WebSockets tab list only connections this profile actually changed headers on, or every connection that matches the profile's filters? → A: Only connections where at least one enabled request-header rule was applied to the handshake (same rule as Logs)
- Q: Which decoded views should a WebSocket message offer? → A: Text, JSON (formatted), Hex, Base64, and MessagePack (decoded to readable JSON)
- Q: When the user opens a message, should the view be chosen automatically from its content, or should it always start in one fixed view? → A: Auto-detect (text → JSON if valid, else Text; binary → MessagePack if it decodes cleanly, else Hex); the user can switch views

### Session 2026-09-30

- Q: Should WebSocket capture keep sharing the Logs recording button? → A: No. Logs and WebSockets each have their own independent start/pause control per profile. Supersedes the 2026-09-29 "shared" answer.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Dedicated WebSockets Tab in the Profile (Priority: P1)

The profile content area gains a third tab, **WebSockets**, next to **Headers** and **Logs**. It lists WebSocket connections that this profile has patched (its enabled filters match the connection and at least one of its enabled request-header rules was applied to the connection handshake). WebSocket traffic is kept apart from the HTTP request log so a long-lived socket with many messages does not flood the Logs list, and so HTTP rows stay scannable.

**Why this priority**: The feature asks for a separate place for WebSocket capture. Without the tab and connection list, nothing else in this feature is visible.

**Independent Test**: With a profile that adds a request header and has no filters, start recording on the WebSockets tab, open a page that connects a WebSocket, and confirm one row for that connection appears. Confirm the Logs tab does not show the socket.

**Acceptance Scenarios**:

1. **Given** the popup is open on a profile, **When** the user looks at the profile content area, **Then** they see three tabs: Headers, Logs, and WebSockets, and Headers is selected by default.
2. **Given** WebSocket recording is on and a page opens a WebSocket that this profile patches, **When** the user opens the WebSockets tab, **Then** a row shows the time, the connection URL, and the connection state (connecting, open, closed with code, or failed).
3. **Given** a WebSocket connection is not matched by the profile's filters, or is matched but no header rule applies to it, **When** it connects, **Then** it does not appear on the WebSockets tab.
4. **Given** a WebSocket was captured, **When** the user opens the Logs tab, **Then** the WebSocket connection is not listed there.
5. **Given** the user switches between Headers, Logs, and WebSockets, **When** they return to Headers, **Then** editor contents and the active profile are unchanged, and header modification is unaffected.

---

### User Story 2 - Inspect Messages of a Connection (Priority: P1)

Selecting a connection shows its handshake request headers (after this profile's modification) and the messages exchanged on it, in order, each marked as sent or received with a timestamp and size. Text messages are readable; JSON text is shown formatted the same way the request log formats JSON bodies. New messages on an open connection appear while the user watches.

**Why this priority**: Users capture sockets to see what goes over them. A connection list alone does not answer "what did the server send?".

**Independent Test**: Record a connection to an echo server, send three text messages from the page, open the connection on the WebSockets tab, and confirm six messages (three sent, three received) in order with correct content.

**Acceptance Scenarios**:

1. **Given** a captured connection, **When** the user opens it, **Then** they see the handshake request headers as sent after this profile's modification, including `Cookie` and `Authorization` in full.
2. **Given** a captured connection has exchanged text messages, **When** the user opens it, **Then** each message shows direction (sent/received), time, size, and its text content, oldest first.
3. **Given** a text message contains valid JSON, **When** the user views it, **Then** it is shown pretty-printed and can be copied as the original text.
4. **Given** a binary message was exchanged, **When** the user views it, **Then** the row shows direction, time, size, and a binary marker, and the detail can show its content as Hex, Base64, or Text.
5. **Given** the connection is open and the WebSockets tab is showing it, **When** new messages are exchanged, **Then** they appear within about 2 seconds without reopening the popup.
6. **Given** the connection closes, **When** the user views it, **Then** its state shows closed with the close code (and reason if given), and earlier messages remain readable.
7. **Given** a message whose content is MessagePack, **When** the user picks the MessagePack view, **Then** it is shown decoded as readable JSON.
8. **Given** a text message whose content is Base64, **When** the user picks the Base64 view, **Then** the decoded bytes are shown (as text when valid UTF-8, otherwise as Hex).
9. **Given** the user picks a view the message cannot be decoded as (e.g., MessagePack on plain text), **When** the view renders, **Then** it shows a short "cannot decode as MessagePack" notice and the original content stays available.
10. **Given** a text message that is valid JSON or a binary message that is valid MessagePack, **When** the user opens it, **Then** it opens in the JSON or MessagePack view respectively; any other text opens in Text and any other binary in Hex.

---

### User Story 3 - Independent Recording Control and Clearing (Priority: P2)

Logs and WebSockets are recorded independently. Each tab has its own start/pause control for the active profile, its own recording indicator, and its own clear action. Starting or pausing one never changes the other, so a user can watch only sockets, only HTTP requests, or both.

**Why this priority**: A chatty socket or a busy page can make one capture noisy while the other is wanted. Two independent controls let the user record only what they need, and match the "separate tab" mental model.

**Independent Test**: Start recording on WebSockets only and confirm a socket is captured but HTTP requests are not. Start Logs recording and confirm both are captured. Pause Logs and confirm sockets are still captured. Clear on WebSockets and confirm HTTP log rows remain.

**Acceptance Scenarios**:

1. **Given** WebSocket recording is off for the profile, **When** a patched WebSocket connects, **Then** nothing is captured, even if Logs recording is on.
2. **Given** the user starts recording on the WebSockets tab, **When** they open the Logs tab, **Then** Logs recording is still off, and HTTP requests are not captured until the user starts it there.
3. **Given** Logs recording is on and WebSocket recording is off, **When** HTTP requests and a WebSocket connection occur, **Then** only the HTTP requests are captured, and vice versa.
4. **Given** WebSocket recording is paused while a captured connection is still open, **When** further messages are exchanged, **Then** they are not added, and already-captured messages remain.
5. **Given** captured connections exist, **When** the user clears the WebSockets tab, **Then** all captured WebSocket data for that profile is removed, the HTTP request log is untouched, and both recording states are unchanged.
6. **Given** captured WebSocket data exists, **When** the browser fully restarts, **Then** it is discarded and WebSocket recording is off, matching the request log.
7. **Given** either recording is on, **When** the user is on the Headers tab, **Then** the compact status area shows that recording is active (naming which one), and each tab label shows its own recording marker.

---

### Edge Cases

- A connection that fails the handshake appears with a failed state and its handshake headers; it has no messages.
- A connection opened before recording started is not captured, even if it is still open when recording starts.
- A very chatty connection: each connection keeps only its most recent messages up to a fixed cap (see Assumptions); older messages drop off and the detail view shows that earlier messages were dropped.
- Many connections: the tab keeps only the most recent connections up to a fixed cap; older ones drop off silently.
- A message (text or binary) larger than the per-message size cap is stored truncated with a visible truncated marker; decoded views run on the truncated content and say so.
- Profile filters with a resource-type filter: a WebSocket is eligible only when the profile's type filter is empty or includes the WebSocket type.
- Tab-lock active: only connections opened from the locked tab are captured.
- Global pause or no enabled header rules: both recording controls turn off, matching the request log's idle rule; captured data stays.
- Profile deleted: its captured WebSocket data is discarded with it; undo restores the profile with empty WebSocket data and recording off.
- Response header rules do not apply to WebSockets in a way the user can observe; only request-header rules on the handshake count as "patched".
- Sockets opened by workers or other contexts where messages cannot be observed: the connection may still be listed from its handshake, with an explicit "messages not available" state.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The profile content area MUST present three tabs: Headers (default), Logs, and WebSockets.
- **FR-002**: While a profile's WebSocket recording is on, the system MUST capture each WebSocket connection that (a) matches the profile's enabled filters, including its resource-type filter when set, (b) is in scope of global pause and tab-lock, and (c) had at least one of the profile's enabled request-header rules applied to its handshake.
- **FR-003**: WebSocket connections MUST NOT appear in the Logs tab, and HTTP requests MUST NOT appear in the WebSockets tab.
- **FR-004**: Each captured connection MUST record start time, URL (origin + path + query; credentials and fragment dropped), connection state (connecting, open, closed with code and reason, failed), and the post-modification handshake request headers, shown in full with no redaction.
- **FR-005**: Each captured connection MUST record the messages exchanged after capture started, in order, each with direction, timestamp, byte size, and and its content (text for text messages, raw bytes for binary messages).
- **FR-006**: JSON text messages MUST be shown pretty-printed, and the user MUST be able to copy a message's original content.
- **FR-007**: While the WebSockets tab is open, new connections, state changes, and new messages MUST appear within about 2 seconds.
- **FR-008**: WebSocket recording MUST be a separate on/off state per profile from request-log recording. Each tab MUST have its own start/pause control and indicator, and changing one MUST NOT change the other. Both default to off and both turn off together on global pause or when the profile has no enabled header rules.
- **FR-009**: The WebSockets tab MUST provide a clear action that removes only that profile's WebSocket data without changing either recording state or the HTTP request log.
- **FR-010**: Captured WebSocket data MUST persist across popup close/reopen within a browser session, MUST reset on full browser restart, and MUST stay on the device (excluded from cloud backup, profile export, and dump files).
- **FR-011**: The system MUST cap stored connections per profile, messages per connection, content size (text or binary) per message, and total WebSocket storage, dropping the oldest data first and marking truncation or dropped messages where content is cut.
- **FR-012**: The feature MUST work in both Chrome and Firefox.
- **FR-013**: The WebSockets tab MUST show an empty state explaining that recording must be on to capture patched WebSocket connections, and a distinct empty state for a connection with no messages yet.
- **FR-014**: Each message MUST offer these decoded views: Text, JSON (pretty-printed), Hex, Base64 (encode binary to Base64, or decode Base64 text), and MessagePack (decoded to readable JSON). A view that fails to decode MUST show a "cannot decode" notice without hiding the original content. Protobuf, gzip/deflate, and other formats are out of scope.
- **FR-015**: A message MUST open in an auto-detected view: text messages in JSON when they parse as a JSON object or array, otherwise Text; binary messages in MessagePack when the whole message decodes cleanly, otherwise Hex. The user MUST be able to switch to any other view; the choice is not remembered.

### Key Entities

- **WebSocket Connection Entry**: one captured socket for a profile — start time, URL, state, close code/reason, handshake headers after modification, list of messages, dropped-message flag.
- **WebSocket Message**: one frame on a connection — direction (sent/received), timestamp, byte size, kind (text/binary), content as text or raw bytes (possibly truncated).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can go from opening the popup to reading the latest received message on a captured connection in under 15 seconds.
- **SC-002**: 100% of text messages exchanged on a patched connection while recording (up to the per-connection limit or the WebSocket storage budget, whichever is reached first) appear in the detail view, in order, with correct direction.
- **SC-003**: New messages on an open connection appear in the open WebSockets tab within 2 seconds in at least 95% of cases.
- **SC-004**: A connection exchanging 1,000 messages does not make the popup noticeably slow: switching tabs and opening the connection each take under 1 second.
- **SC-005**: Adding WebSocket capture causes zero changes to which HTTP requests appear on the Logs tab for the same traffic, other than WebSocket connection requests no longer appearing there.
- **SC-006**: All acceptance scenarios pass in both Chrome and Firefox.
- **SC-007**: For a sample set of JSON, plain text, MessagePack, and raw binary messages, 100% open in the expected auto-detected view and every supported view either shows the correct decoded content or a "cannot decode" notice.

## Assumptions

- "Separate tab" means a third tab inside the popup's profile content area, next to Headers and Logs (confirmed in Clarifications). A standalone browser-tab view is out of scope.
- WebSocket recording has its own toggle, independent of request-log recording (confirmed in Clarifications, 2026-09-30). Existing profiles and the request-log control keep behaving as in feature 003.
- Only connections this profile patches are captured, consistent with the request log (confirmed in Clarifications). Capturing filter-matched but unpatched WebSockets is out of scope.
- Caps: 50 connections per profile, 500 most recent messages per connection, 64 KB of content (text or binary) per message, all within the existing session storage budget for logs.
- Header values are shown unredacted, consistent with the request log decision in feature 003.
- Sending, editing, replaying, or blocking WebSocket messages is out of scope; this is read-only capture.
- The request-log storage budget shrinks from 8 MB to 7 MB to make room for WebSocket data (2 MB) within the browser's session-storage quota.
- A "WebSocket" resource type is added to the profile's type filter choices so users can include or exclude sockets from matching.
