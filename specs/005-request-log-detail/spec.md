# Feature Specification: Expandable Request Log Detail

**Feature Branch**: `005-request-log-detail`

**Created**: 2026-08-18

**Status**: Draft

**Input**: User description: "refer spec: 003-profile-request-logs. I want you verify request body & response body in request log detail. I also want you re-design for request log row, expand to show request log detail. enhance request log detail"

## Clarifications

### Session 2026-08-18

- Q: For a patched API call (XHR or fetch) that sent a text body and got a text response back, what must the expanded detail contain? → A: XHR/fetch must show the real request body and response body when they exist. Other types may still say unavailable for a response body.
- Q: After the user starts recording, must XHR and fetch bodies be captured on tabs that were already open, without reloading those pages? → A: Already-open tabs capture XHR/fetch bodies as soon as recording is on. No reload required.
- Q: Must API calls made by a service worker (not by the page itself) also have their request and response bodies captured? → A: Required for page-initiated XHR/fetch only. Service-worker calls may miss the response body.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Expand a Log Row to Open Detail (Priority: P1)

On the Logs tab, each captured request is a compact row. Activating the row expands it in place and shows that request's full detail underneath. Activating the same row again collapses it. Opening another row closes the one that was open, so the compact popup stays scannable. Copy cURL still works on the collapsed row and does not expand it.

**Why this priority**: The rest of the feature lives inside the expanded detail. Without a clear expand/collapse row, the user cannot reach bodies or the enhanced detail. This is the interaction model the user asked for.

**Independent Test**: Record at least two patched requests. Click the first row and confirm detail opens below it. Click the second row and confirm the first closes and the second opens. Click the open row again and confirm it collapses. Copy cURL from a collapsed row without opening it.

**Acceptance Scenarios**:

1. **Given** at least one log row, **When** the user activates the row (not the copy-cURL control), **Then** that row expands in place and its request log detail is visible without leaving the Logs tab.
2. **Given** a row is expanded, **When** the user activates the same row again, **Then** the detail collapses and the list returns to compact rows.
3. **Given** one row is expanded, **When** the user expands a different row, **Then** the first row collapses and only the newly selected row is expanded.
4. **Given** a collapsed row, **When** the user activates copy cURL, **Then** the command is copied and the row does not expand.
5. **Given** a row is expanded, **When** that entry's status or bodies update (pending to a code, response body arrives), **Then** the open detail refreshes in place without the user collapsing and reopening it.
6. **Given** the compact popup, **When** a row is expanded, **Then** the list still scrolls, the popup does not grow sideways, and the expanded detail is contained inside the Logs tab.

---

### User Story 2 - Verify Request and Response Bodies (Priority: P1)

When a row is expanded, the user can read the request body and the response body of that patched call and confirm they match what went out and what came back. For patched, page-initiated XHR and fetch calls, those bodies MUST actually be captured when they exist — not left empty or marked unavailable. Each body is labeled, visually separate from headers, and large enough to read. Empty, waiting, binary, unavailable, and truncated states are explicit — the user never has to guess whether a blank panel means “no body” or “not captured.” Structured text (such as JSON) is shown in a readable formatted form; other text is shown as captured. Each body has its own copy action.

**Why this priority**: Confirming a patch often means checking the payload, not only the headers. Users currently open a row and see no bodies. This story requires the data to be obtained for API calls, then shown so it can be verified.

**Independent Test**: Record a patched, page-initiated POST XHR or fetch with a JSON request body and a JSON response. Expand the row. Confirm both bodies are present, readable, and formatted — not empty and not “unavailable.” Copy each body and paste to confirm the stored text. Repeat with a GET (empty request body) and with a still-pending row (response body waiting).

**Acceptance Scenarios**:

1. **Given** a patched, page-initiated XHR or fetch that sent a text request body, **When** the user expands the completed row, **Then** they can read that request body in the detail — it MUST have been captured, not shown as empty or unavailable.
2. **Given** a patched, page-initiated XHR or fetch whose text response has arrived, **When** the user expands the row, **Then** they can read that response body in the detail — it MUST have been captured, not shown as empty or unavailable.
3. **Given** a logged GET or other request with no request body, **When** the user expands the row, **Then** the request-body area shows a clear empty/not-sent state, not a blank panel.
4. **Given** a row that is still pending, **When** the user expands it, **Then** the response-body area shows that it is waiting, and updates to the captured body or an explicit empty/unavailable/binary state when the response arrives.
5. **Given** a text body that is valid structured data (for example JSON), **When** it is shown in the detail, **Then** it is formatted so nested fields are readable without the user copying it elsewhere to reformat.
6. **Given** a text body that is not structured, **When** it is shown, **Then** the captured text is shown as-is.
7. **Given** a binary, unavailable, or truncated body, **When** the user looks at that body area, **Then** they see an explicit reason (cannot display as text / not available for this type / truncated) rather than raw garbage or silence.
8. **Given** a text request or response body, **When** the user activates that body's copy action, **Then** the stored body text is placed on the clipboard and they get brief confirmation, without copying headers or the other body.
9. **Given** a normal web tab that was already open before recording started, **When** the user starts recording and that page (or an embed in it) makes a patched XHR or fetch, **Then** that call's request and response bodies are captured and visible in the expanded detail without the user reloading the page.

---

### User Story 3 - Enhanced Request Log Detail (Priority: P2)

The expanded detail is organized so the user can move between an overview of the call and the request side versus the response side, instead of one unlabeled dump. Overview shows method, full URL, status, resource type, and time. The request side groups request headers and request body. The response side groups response headers and response body. Headers remain the full post-modification snapshot, including secret values. Long header lists and long bodies scroll inside their own areas.

**Why this priority**: A redesigned row only helps if the open detail is also easier to scan. This story can ship after expand and body verification, and is independently testable on any captured entry.

**Independent Test**: Expand a completed XHR row. Without scrolling the whole popup, identify method, full URL, and status in the overview; find request headers separately from response headers; find each body in its own labeled area.

**Acceptance Scenarios**:

1. **Given** an expanded row, **When** the user looks at the detail, **Then** they can tell overview, request, and response apart without reading a single run-on block.
2. **Given** an expanded row, **When** they inspect the overview, **Then** they see method, the full stored URL (origin + path + query), status, resource type, and time.
3. **Given** an expanded row, **When** they inspect the request side, **Then** they see the post-modification request headers and the request body together.
4. **Given** an expanded row, **When** they inspect the response side, **Then** they see the post-modification response headers (or waiting, if still pending) and the response body together.
5. **Given** many headers or a long body, **When** the user scrolls inside the detail, **Then** those areas scroll locally and do not force the popup to scroll horizontally.
6. **Given** `Authorization` or `Cookie` on the request, **When** the user inspects request headers in the enhanced detail, **Then** those values appear in full, same as today.

---

### Edge Cases

- What happens if the user expands a row and then the type filter hides it? The row disappears with the filter; no detail stays open for a hidden row. Showing the type again does not auto-reopen it.
- What happens if the open entry is dropped by the 200-entry cap or the log is cleared? The detail closes and the list shows the remaining rows or the empty state.
- What happens if the user switches profiles or leaves Logs? The expanded row does not carry over. Returning to Logs starts with all rows collapsed.
- What happens if the user switches to Headers and back while a row was expanded? The list is collapsed again (Headers is a different workspace tab; expand is not remembered).
- What happens when a body is larger than the 64 KB store cap from feature 003? The stored truncated text is shown with a visible truncated marker. The user is not offered the omitted tail.
- What happens when formatting structured text fails? The captured text is shown as-is. Formatting never hides or rewrites the stored body.
- What happens when copy body runs on an empty, binary, or unavailable body? Nothing is copied; the user is told there is no text to copy.
- What happens when copy body runs on a truncated text body? The stored (truncated) text is copied, and the confirmation mentions it is truncated.
- What happens when two rows update while one is open? Only the open row's detail refreshes; collapsed rows update their summary fields as they do today.
- What happens on a very long URL? The collapsed row still truncates; the expanded overview shows the full stored URL and allows selecting/copying it.
- What happens if recording is off but entries already exist? Expand, body verification, and enhanced detail still work on those entries.
- What happens for a patched document, script, image, or other non-XHR/fetch type? A request body is shown if one was sent and captured. The response body MAY stay unavailable for those types.
- What happens if an XHR/fetch request truly had no body (GET) or an empty response? The matching area shows the explicit empty/not-sent state, not unavailable.
- What happens if the user starts recording on tabs that are already open? Those tabs, including their embeds, MUST start capturing XHR/fetch bodies immediately. Reloading is not required.
- What happens if the browser's own request listener does not include a request payload (some fetch/FormData calls)? The request body MUST still be obtained from the call itself for page-initiated XHR/fetch so FR-017 is met.
- What happens if the API was initiated by a service worker rather than the page? The row is still logged if the profile patched it. The response body MAY stay unavailable. A request body is shown if the browser exposed one.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Each log row MUST expand in place to show that entry's request log detail, and MUST collapse when activated again. Expand MUST NOT navigate away from the Logs tab.
- **FR-002**: At most one log row MAY be expanded at a time. Expanding a different row MUST collapse the previously expanded row.
- **FR-003**: Copy cURL MUST remain available on the collapsed row and MUST NOT expand or collapse the row.
- **FR-004**: The collapsed row MUST remain scannable: method, status, resource type, and truncated URL stay identifiable without opening the detail (as specified in feature 004).
- **FR-005**: While a row is expanded, live updates to that entry (status, headers, bodies) MUST appear in the open detail without requiring the user to collapse and reopen it.
- **FR-006**: Expand state MUST reset to all-collapsed when the user leaves the Logs tab, switches profile, clears the log, or the expanded entry is no longer visible.
- **FR-007**: The expanded detail MUST present the request body and the response body as separately labeled areas the user can read and distinguish.
- **FR-008**: Text request and response bodies MUST be readable in the expanded detail. Empty or missing bodies MUST show an explicit empty/not-sent state. Pending responses MUST show a waiting state until the body arrives or is known to be empty, binary, or unavailable. Binary bodies MUST say they cannot be displayed as text. Unavailable bodies MUST say they are not available for this resource type. Truncated bodies MUST show a visible truncated marker.
- **FR-009**: When a text body is valid structured data (JSON object or array), the detail MUST show it formatted for reading. When it is not structured or formatting is not possible, the detail MUST show the captured text unchanged.
- **FR-010**: Formatting a structured body MUST NOT change the stored body. Copy body MUST copy the stored text (not a reformatted variant that alters the payload).
- **FR-011**: Each text request body and each text response body MUST have its own copy action. Activating it MUST copy that body's stored text and MUST confirm success. Empty, binary, and unavailable bodies MUST NOT copy silently; the user MUST be told there is no text to copy. A truncated copy MUST mention that the text is truncated.
- **FR-012**: The expanded detail MUST include an overview of the call: method, full stored URL, status, resource type, and time.
- **FR-013**: The expanded detail MUST group request headers with the request body, and response headers with the response body, so the user can inspect one side of the call at a time.
- **FR-014**: Header snapshots in the enhanced detail MUST remain the post-modification full header set, with secret values shown in full, as specified in feature 003.
- **FR-015**: Long URLs, long header lists, and long bodies MUST overflow inside the detail (truncate or scroll locally). They MUST NOT force horizontal scrolling of the popup.
- **FR-016**: This feature MUST NOT change which requests are logged, recording start/pause, the type filter, profile storage, export, or backup. It MAY change how request and response bodies are obtained so that FR-017 is met.
- **FR-017**: For every patched **page-initiated** XHR or fetch entry (including calls from embeds in the page), the system MUST capture the request body when the call sent one, and MUST capture the response body when the call received a text response. Those captured bodies MUST appear in the expanded detail. “Unavailable” MUST NOT be used for a page-initiated XHR/fetch body that existed. Other resource types, and calls initiated by a service worker rather than the page, MAY still show an unavailable response body.
- **FR-018**: Starting recording MUST enable XHR/fetch body capture on tabs that are already open, including embeds in those tabs. The user MUST NOT need to reload a page for bodies on that page to be captured.

### Key Entities *(include if feature involves data)*

- **Log Row (collapsed)**: Compact summary of one captured request: time, method, status, resource type, truncated URL, plus copy-cURL. Activating the row toggles expand.
- **Request Log Detail (expanded)**: In-place panel for one entry. Contains overview, request side (headers + body), and response side (headers + body). Exists only while that row is expanded.
- **Body Presentation**: How a stored body is shown: formatted structured text, raw captured text, or an explicit empty / waiting / binary / unavailable / truncated state. Presentation does not change the stored body.
- **API Body Capture**: Obtaining the request and response payloads of a patched, page-initiated XHR or fetch (including embeds). Required when those payloads exist. Service-worker-initiated calls are not required to have a response body. Distinct from merely displaying a body that was already stored.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can open a log entry's detail in 1 click from the Logs list and see it without leaving the tab.
- **SC-002**: After a patched XHR or fetch with a text request body and a text response completes, a user can expand the row and read both captured bodies in under 10 seconds. A sample of such calls MUST show the real payloads, not empty or unavailable.
- **SC-003**: A user can copy the request body or the response body from the expanded detail in 1 click each.
- **SC-004**: 90% of first-time testers can point to the request body and the response body on an expanded row without extra documentation.
- **SC-005**: In a list of 10 rows, a tester can still name method, status, and type for any collapsed row in under 3 seconds.
- **SC-006**: Copy cURL from a redesigned row still takes 1 click on the collapsed row and does not open the detail.
- **SC-007**: Expanding a second row leaves exactly one detail panel open.
- **SC-008**: A nested JSON request or response body is readable in the detail without the user pasting it into another tool to reformat.
- **SC-009**: Starting recording and then triggering a patched XHR or fetch on an already-open page (no reload) produces a log row whose expanded detail shows the real request and response bodies.

## Assumptions

- This feature builds on profile request logs from `003-profile-request-logs` and the scannable row / type filter from `004-log-type-filter`. Which requests are logged, recording, caps (200 entries, 64 KB per body), unredacted secrets, and local session-only storage stay as specified there. How XHR/fetch bodies are obtained is in scope because those payloads are not reliably present today. Capture MUST work on already-open tabs as soon as recording starts; a reload MUST NOT be required.
- “Verify request body and response body” means the user can inspect the real captured payloads for patched, page-initiated XHR/fetch calls — not schema validation and not diffing against an expected fixture. Response-body capture is required for those page calls, optional for other resource types, and not required when a service worker initiated the call.
- Expand is in-place under the row (not a separate page, dialog, or side panel). One open row at a time is the default because the popup is compact.
- Expand state is view-only and is not remembered across tab switches, profile switches, or popup reopen.
- Structured formatting applies to JSON objects and arrays. Other text (form bodies, plain text, HTML) is shown as captured. A raw/formatted toggle is out of scope; copy always returns the stored text.
- Copy body is new and lives in the detail. Copy cURL stays on the row and still represents the patched request, including the request body when it is stored text.
- The compact popup chrome from feature 002 is unchanged. This feature redesigns the log row and detail, and it must actually obtain page-initiated XHR/fetch bodies so that detail is not empty.
