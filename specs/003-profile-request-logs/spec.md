# Feature Specification: Profile Request Logs

**Feature Branch**: `003-profile-request-logs`

**Created**: 2026-08-17

**Status**: Draft

**Input**: User description: "in profile content, I want to split into two tab. one for current view (header editor). one for request logs of patched apis based on filter. for request logs, I need to enable via span/pause button (on use)" Later: "make sure I can see request body & response body. I also need to add an action button on request logs row for copy curl command"

## Clarifications

### Session 2026-08-17

- Q: When a profile is recording, which patched requests should appear in the log? → A: Every request this profile patches that matches its enabled filters (all types if there is no type filter)
- Q: After a full browser restart, what should happen to recording and to entries already captured? → A: Both reset on browser restart; the user must start recording again
- Q: How much of each request URL should the log store and show? → A: Store and show origin + path + query string; drop embedded credentials and fragments
- Q: Should each log row include the HTTP status of the patched request (200, 404, failed), or only what this profile applied? → A: Include status and resource type (XHR, script, document, …) on every row
- Q: While the popup stays open on the Logs tab, should new patched requests appear in the list as they happen? → A: Live: new and updated entries appear within about 2 seconds while the Logs tab is open
- Q: When someone opens a log row, which headers should they see? → A: A snapshot of the request/response headers after modification (full header set)
- Q: In that header snapshot, should sensitive headers such as Cookie, Authorization, and Set-Cookie be stored and shown in full? → A: Superceded — later answer: show and copy real secret header values (no redaction)
- Q: If recording is on, should the user still see that while they are on the Headers tab or after they reopen the popup on Headers? → A: Show a recording indicator on the Logs tab and in the existing status area so it is visible from Headers
- Q: Should request and response bodies be visible, and can a row copy a cURL command? → A: Yes — entry detail shows request and response bodies; each log row has a copy-cURL action. Supercedes the earlier "bodies out of scope" default.
- Q: Should the copied cURL command include the real Authorization and Cookie values so it can be replayed, or keep those values redacted like the on-screen snapshot? → A: Show and copy real secret header values (no redaction)
- Q: Should the header snapshot and the copied cURL represent the request after this profile applied its headers, or the original request before the patch? → A: After this profile’s modification (patched request and/or response)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Split Profile Workspace into Editor and Logs (Priority: P1)

When the user opens a profile, the profile content area is split into two tabs: **Headers** (the existing header and filter editor) and **Logs** (a request log for APIs this profile has patched). The Headers tab is the default. Switching tabs does not change the active profile, does not lose unsaved editor state, and does not start or stop header modification.

**Why this priority**: This is the structural change the rest of the feature sits on. Without a dedicated place for logs, recording has nowhere to surface. The editor must remain the default so everyday header work is unchanged.

**Independent Test**: Open the popup, confirm two content tabs are visible for the active profile, confirm the Headers tab shows the current editor, switch to Logs and back, and confirm the editor content is intact and header modification still works while on either tab.

**Acceptance Scenarios**:

1. **Given** the popup is open on a profile, **When** the user looks at the profile content area, **Then** they see two tabs labeled for the header editor and for request logs, and the header editor tab is selected by default.
2. **Given** the header editor tab is selected, **When** the user inspects the content, **Then** the existing filter editor, request-header table, and response-header table are present and fully usable.
3. **Given** the user is on the header editor tab, **When** they switch to the logs tab and back, **Then** editor contents, scroll position, and the active profile are unchanged.
4. **Given** the user switches to a different profile, **When** the content area updates, **Then** the same two tabs are available for that profile, and the header editor tab is shown again.

---

### User Story 2 - Opt-in Recording of Patched Requests (Priority: P1)

Request logging is off until the user explicitly starts it. On the logs tab, a start/pause control turns recording on or off for the active profile. While recording is on, the extension captures each network request that this profile actually patches (a request that matches the profile's enabled filters and has at least one of this profile's enabled header rules applied). Recording continues in the background even if the popup is closed. Pausing stops new entries from being added; existing entries remain. A full browser restart turns recording off and discards every profile's log; the user must start recording again.

**Why this priority**: Logging every request by default would be noisy, costly, and a privacy risk. The user asked for on-use recording via a start/pause control. This is the core value of the feature.

**Independent Test**: With a profile that adds a request header and a URL filter, start recording, trigger a matching request and a non-matching request, pause recording, trigger another matching request, and verify only the first matching (patched) request appears.

**Acceptance Scenarios**:

1. **Given** the user has never started recording for a profile, **When** they open the logs tab, **Then** recording is off, the start control is offered, and the log is empty (or shows a clear empty state).
2. **Given** recording is off, **When** matching requests occur, **Then** no new log entries are created.
3. **Given** recording is on for the active profile, **When** a request matches the profile's enabled filters and is patched by at least one enabled header rule, **Then** a log entry appears for that request.
4. **Given** recording is on, **When** a request does not match the profile's enabled filters, or matches but is not patched by this profile, **Then** it is not logged.
5. **Given** recording is on, **When** the user pauses it, **Then** no further entries are added, and entries already captured remain visible.
6. **Given** recording is on, **When** the user closes and later reopens the popup, **Then** recording is still on and entries captured while the popup was closed are visible.
7. **Given** the extension is globally paused (header modification off), **When** recording is on, **Then** recording turns off for every profile, existing entries remain, and no new log entries are created.
8. **Given** recording is on for profile A, **When** the user switches to profile B, **Then** profile A's recording state is unchanged, and profile B has its own independent recording state (off unless the user started it there).
9. **Given** recording is on and the log has entries, **When** the browser fully restarts, **Then** recording is off for every profile, every log is empty, and the user must start recording again.
10. **Given** recording is on, **When** the user is on the Headers tab or reopens the popup on Headers, **Then** a recording indicator is visible in the compact status area; they must go to the Logs tab to pause.

---

### User Story 3 - Inspect and Manage Captured Logs (Priority: P2)

On the logs tab the user can review captured entries, see enough detail to confirm which API was patched and what changed, and clear the log when they are done. The list stays usable as entries accumulate. While the Logs tab is open, new patched requests and status updates appear in the list within about 2 seconds without the user leaving or reopening the popup.

**Why this priority**: Recording has little value if the user cannot read or reset the results. This is independently testable once entries exist, and can ship after the capture path.

**Independent Test**: Start recording, generate several patched requests, open the logs tab, inspect an entry's details, clear the log, and verify the list is empty while recording state is unchanged.

**Acceptance Scenarios**:

1. **Given** one or more entries exist, **When** the user views the logs tab, **Then** each entry shows at least the time, HTTP method, URL, resource type, status (pending, HTTP code, or failed), and a summary of which headers this profile applied.
2. **Given** the user selects an entry, **When** they inspect its details, **Then** they see a snapshot of that request's and/or response's headers as they were after this profile's modification (the full header set, not only the rules this profile applied).
3. **Given** entries exist, **When** the user clears the log, **Then** all entries for that profile are removed and recording stays in its current on/off state.
4. **Given** more entries exist than fit on screen, **When** the user scrolls the list, **Then** older entries remain reachable.
5. **Given** the log is empty, **When** the user views the logs tab, **Then** they see a short empty-state message that tells them to start recording to capture patched requests.
6. **Given** recording is on and the Logs tab is open, **When** a matching request is patched, **Then** its row appears in the list within 2 seconds and later updates from pending to a status code or failed without the user leaving the tab.

---

### User Story 4 - Inspect Bodies and Copy as cURL (Priority: P2)

When the user opens a log entry they can read the request body and the response body of that patched call. Each log row has an action that copies a cURL command for the request to the clipboard so they can replay it elsewhere. Response bodies are expected for XHR/fetch-style calls; other resource types may show an explicit unavailable state for the response body.

**Why this priority**: Confirming a patch often means seeing the payload that went out and what came back, then replaying the call. This sits on top of capture and the log list; it is independently testable once entries exist.

**Independent Test**: Record a patched POST with a JSON body and a JSON response, open the entry, confirm both bodies are readable, click copy cURL on the row, and paste to confirm method, URL, headers, and request body are in the command.

**Acceptance Scenarios**:

1. **Given** a logged request that had a text request body, **When** the user opens the entry, **Then** they can read that request body without leaving the Logs tab.
2. **Given** a logged request whose response has arrived with a text body, **When** the user opens the entry, **Then** they can read that response body. While the row is still pending, the response body area shows that it is waiting.
3. **Given** a logged GET or other request with no body, **When** the user opens the entry, **Then** the request-body area shows a clear empty/not-sent state rather than a blank panel.
4. **Given** at least one log row, **When** the user activates the copy-cURL action on that row, **Then** a cURL command is placed on the clipboard and the user gets brief confirmation, without opening the row first.
5. **Given** the user copies cURL for a request that had a text body, **When** they paste the command, **Then** it includes the HTTP method, the stored URL, the post-modification request headers, and the request body.
6. **Given** a logged request includes `Authorization` or `Cookie`, **When** the user opens the entry or copies cURL, **Then** those header values appear in full in both the snapshot and the copied command.

---

### Edge Cases

- What happens when the profile has no filters? The profile applies everywhere, so every request this profile actually patches is eligible to be logged while recording is on — including documents, scripts, images, and other types, not only XHR/fetch.
- What happens when the profile has a type filter? Only patched requests of those selected types are logged.
- What happens when all header rules are disabled? Nothing is patched, so recording turns off for that profile (existing entries remain) and no new entries are created. The same reset happens on global pause — one idle path whenever headers are not being modified.
- What happens when filters are edited while recording is on? Subsequent requests are evaluated against the current filters; already-captured entries are not retroactively removed or rewritten.
- What happens when the user deletes a profile that has logs or is recording? Recording stops and that profile's log is discarded with the profile. Undo of profile deletion restores the profile's rules but not its request log; the restored profile starts with recording off and an empty log, and other profiles' logs stay aligned with their tabs.
- What happens when the captured list grows very large? The log keeps only the most recent entries up to a fixed cap (see Assumptions); older entries drop off silently.
- What happens when a request is still in flight? The entry appears immediately as pending and updates to an HTTP status code or failed when the response arrives or the request fails.
- What happens if a URL is very long or contains credentials? The list truncates the visible URL; the stored and detail URL is origin + path + query string only. Embedded credentials (`user:password@`) and fragments (`#…`) are dropped and never stored. Header values, including `Cookie` and `Authorization`, are stored and shown in full. Logs stay on the device and are not included in cloud backup or profile export.
- What happens on a fresh install or after storage is cleared? Recording is off and the log is empty for every profile.
- What happens when tab-lock is active? Only patched requests on the locked tab are logged, matching how header modification is scoped.
- What happens if recording is on across a browser restart? Recording turns off for every profile and every log is discarded. Closing only the popup does not reset recording or the log.
- What happens when a body is empty, binary, or very large? Empty or missing bodies show an explicit empty/not-available state. Binary or non-text bodies show that they cannot be displayed as text. Text bodies longer than 64 KB are stored and shown truncated, with a visible truncated marker. The same cap applies independently to the request body and the response body.
- What happens when copy cURL runs before the response arrives? The command still copies from what is known (method, URL, request headers, request body). It does not wait for the response and does not include a response body.
- What happens when the request body is binary? Copy cURL omits the body and the confirmation tells the user the body was skipped.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The active profile's content area MUST present exactly two tabs: one for the existing header/filter editor and one for request logs.
- **FR-002**: The header editor tab MUST be selected by default when the popup opens and when the user switches to a different profile.
- **FR-003**: The header editor tab MUST continue to provide the existing filter editor and request/response header tables with no loss of current editing capabilities.
- **FR-004**: Switching between the two content tabs MUST NOT change the active profile, MUST NOT start or stop header modification, and MUST NOT discard editor content.
- **FR-005**: Request recording MUST be off by default for every profile and MUST start only when the user explicitly starts it.
- **FR-006**: The logs tab MUST provide a start/pause control that toggles recording for the active profile only.
- **FR-007**: The start/pause control MUST visually reflect whether recording is currently on or off.
- **FR-008**: While recording is on for a profile, the system MUST append a log entry for each network request that (a) matches that profile's enabled filters (or all requests, if the profile has no enabled filters), (b) is in scope of the current global pause and tab-lock state, and (c) has at least one of that profile's enabled header rules applied. There is no implicit restriction to XHR/fetch; resource types are included or excluded only by the profile's own type filters.
- **FR-009**: Requests that are not patched by the recording profile MUST NOT be logged.
- **FR-010**: Recording MUST continue while the popup is closed, until the user pauses it, header modification stops (global pause or the profile has no enabled header rules), the profile is deleted, or the browser fully restarts.
- **FR-011**: Pausing recording MUST stop new entries from being added and MUST leave existing entries in place.
- **FR-012**: Each profile MUST have its own recording on/off state and its own log; switching profiles MUST show that profile's log and control, not another profile's.
- **FR-013**: Recording on/off state and captured log entries MUST persist across popup close/reopen within the same browser session, and MUST both reset (recording off, log empty) after a full browser restart.
- **FR-014**: Each log entry MUST include a timestamp, HTTP method, request URL, resource type, status (pending while in flight, then the HTTP status code or failed), and a snapshot of the request and/or response headers as they were after this profile's modification (the full header set present on the patched request or response, not only the rules this profile applied). The stored URL MUST be origin + path + query string only; embedded credentials and URL fragments MUST be dropped and MUST NOT be stored. Header values, including `Cookie`, `Set-Cookie`, `Authorization`, `Proxy-Authorization`, and `WWW-Authenticate`, MUST be stored and shown in full (not redacted).
- **FR-015**: Users MUST be able to inspect an individual entry's post-modification header snapshot. Request-header snapshots MUST be available when the request is logged; response-header snapshots MUST appear when the response arrives (the row may start without them while status is pending).
- **FR-016**: Users MUST be able to clear the active profile's log without changing recording on/off state.
- **FR-017**: The log MUST remain usable when many entries accumulate, by remaining scrollable and by retaining only the most recent entries up to a documented cap.
- **FR-018**: Request logs MUST remain on the local device and MUST NOT be included in profile export or cloud backup.
- **FR-019**: Each log entry MUST include the request body and the response body when they can be captured. Bodies are shown in the entry detail, not in the collapsed row.
- **FR-020**: The feature MUST work in both supported browsers and MUST NOT change how profiles, header rules, or filters are stored.
- **FR-021**: While the Logs tab is open, new entries and status updates MUST appear in the list within 2 seconds of the request being patched or completing. The user MUST NOT need to switch tabs or reopen the popup to see them.
- **FR-022**: While recording is on for the active profile, a recording indicator MUST be visible on the Logs tab, in the existing compact status area, and on the extension toolbar badge (a rec emoji, same idea as the pause bars) so the user can see it from the Headers tab, after reopening the popup, and with the popup closed. The indicator MUST NOT start or stop header modification. Pausing recording remains on the Logs tab.
- **FR-023**: Request and response bodies that are text MUST be readable in the entry detail. Empty or missing bodies MUST show an explicit empty/not-available state. Non-text/binary bodies MUST show that they cannot be displayed as text. Each body MUST be capped at 64 KB stored; overflow MUST be truncated with a visible marker.
- **FR-024**: Each log row MUST provide a copy-cURL action that works without expanding the row. Activating it MUST copy a cURL command to the clipboard and MUST confirm success to the user.
- **FR-025**: The copied cURL command MUST represent the request after this profile's modification. It MUST include the HTTP method, the stored URL (origin + path + query), request headers from the post-modification snapshot with real values (including `Cookie` and `Authorization`), and the request body when it is stored text. It MUST NOT include the response body. Binary request bodies MUST be omitted, with the user informed that the body was skipped.

### Key Entities *(include if feature involves data)*

- **Profile Content Tab**: One of two views inside the active profile workspace — Headers (editor) or Logs. Independent of the left-hand profile tab bar.
- **Recording Session**: Per-profile on/off flag that decides whether patched requests are captured. Off by default. Survives popup close; resets off after a full browser restart, a global pause, or when the profile no longer has enabled header rules. Cannot stay on while nothing is being patched.
- **Request Log Entry**: One captured patched request for a profile. Attributes: time, method, URL (origin + path + query; no credentials or fragment), resource type, status (pending / HTTP code / failed), a post-modification snapshot of request and/or response headers (full header set, values unredacted), and request/response bodies (text up to 64 KB each; binary marked undisplayable). Belongs to one profile.
- **Request Log**: The ordered list of entries for one profile, newest first, capped at a fixed maximum. Cleared independently of recording state, and discarded on browser restart.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can reach the request log for the active profile in at most 1 click from the default popup view.
- **SC-002**: Users can start or pause recording in at most 1 click after opening the logs tab.
- **SC-003**: After a patched request completes while recording is on, the corresponding log entry (and its status update) is visible in the logs tab within 2 seconds if that tab is already open, or within 2 seconds of reopening or focusing the popup.
- **SC-004**: 100% of existing header-editing and filter-editing actions remain available on the Headers tab with no extra navigation compared to today.
- **SC-005**: In a mixed traffic sample (matching and non-matching URLs), 100% of logged entries are requests this profile actually patched, and 0% of non-matching or unpatched requests appear.
- **SC-006**: 90% of first-time users can start recording, trigger a patched request, and identify that request in the log on the first attempt without extra documentation.
- **SC-007**: Clearing the log takes at most 2 clicks and leaves recording state unchanged.
- **SC-008**: After a patched request with a text body completes, a user can open the entry and read both the request body and the response body in under 10 seconds.
- **SC-009**: A user can copy a cURL command from a log row in 1 click and paste a command that names the same method and URL as the row, without first opening the entry.

## Assumptions

- "span/pause" in the request means start/pause: a dedicated recording control on the logs tab, not the existing global header-modification pause. Global pause still stops patching. Because nothing is being modified, recording resets off (entries stay); unpause does not restart recording. The same reset applies when the profile has no enabled header rules. This is one idle path — recording cannot stay on while headers are not being modified.
- "Patched APIs based on filter" means requests that both match the profile's enabled URL/resource-type filters and actually had at least one of that profile's enabled header rules applied. There is no hidden XHR-only default. Filter-only traffic that was not modified is out of scope.
- Logging is per profile so that two profiles with different filters do not mix traffic. A profile that is not recording never writes entries, even if another profile is recording.
- Recording is opt-in and off by default because request URLs and bodies can contain sensitive data. Logs stay local and are excluded from export and cloud backup. Recording and logs are session-scoped: they survive popup close, and both reset on a full browser restart.
- Entry detail includes a post-modification header snapshot and request/response bodies. Header values, including `Cookie` and `Authorization`, are stored and shown in full so copy-cURL can replay the call. Logs remain local, session-scoped, and excluded from export and backup.
- Text bodies are capped at 64 KB each so a 200-entry log cannot grow without bound. Binary bodies are not shown as text and are omitted from cURL.
- The log retains the most recent 200 entries per profile; older entries are dropped. 200 is enough for a debugging session without unbounded growth.
- Undo of a deleted profile restores rules and settings only; its request log is not restored.
- The last selected content tab is not remembered across profile switches or popup reopen — Headers is always the landing tab — so everyday editing is unchanged.
- Existing profile, filter, and header-rule storage is reused as-is; this feature adds recording state and log data alongside it, not inside exported profile documents.
- The compact popup layout from feature 002 remains the chrome; this feature only splits the profile workspace inside that layout.
