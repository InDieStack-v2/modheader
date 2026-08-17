# Feature Specification: Request Log Type Filter and Row Redesign

**Feature Branch**: `004-log-type-filter`

**Created**: 2026-08-17

**Status**: Draft

**Input**: User description: "I want to support filter by resource type on request logs tab. you also need to update re-design ui for request log row." Later: "I also want to update UX for multi-select resource type in filter"

## Clarifications

### Session 2026-08-17

- Q: Should the type filter always list every known resource type, or only the types that currently appear in this profile’s log? → A: Always show the full standard type list (document, XHR, script, image, …)
- Q: Should every resource type stay on screen as a toggle, or should types live in a picker you open and close? → A: Always-visible toggles for every standard type (selected vs not is obvious on the tab)
- Q: How should “show all types” look so it is not confused with “nothing selected”? → A: An explicit All toggle that is on when every type is visible; turning a specific type on leaves All and shows only that type

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Filter the Log by Resource Type (Priority: P1)

On the Logs tab the user can limit which captured rows are shown by resource type (document, XHR, script, image, and the other types already used by this product). Filtering changes only what is visible. It does not start or stop recording and does not delete entries. Turning a type off hides those rows; turning it back on shows them again.

**Why this priority**: After a short recording session the log mixes documents, scripts, and APIs. Finding the patched API is the reason the log exists. A type filter is the smallest change that makes the list usable.

**Independent Test**: Record mixed traffic (a page load plus an XHR). Switch the Logs filter to XHR only and confirm only XHR rows remain. Switch back to all types and confirm the hidden rows return. Confirm recording state and the stored log are unchanged.

**Acceptance Scenarios**:

1. **Given** the Logs tab has captured rows of more than one resource type, **When** the user selects only one type, **Then** only rows of that type are shown.
2. **Given** a type filter is active, **When** a new matching request of a hidden type is captured, **Then** it is stored but not shown until that type is included again.
3. **Given** a type filter is active, **When** the user selects all types (or clears the filter), **Then** every captured row for this profile is visible again.
4. **Given** the filter hides every current row, **When** the user looks at the list, **Then** they see an empty state that says rows are hidden by the type filter, not that nothing was recorded.
5. **Given** a type filter is set, **When** the user switches to Headers and back, or closes and reopens the popup in the same browser session, **Then** the same type filter is still applied for that profile.
6. **Given** the log is cleared or the browser restarts, **When** the user opens Logs, **Then** the type filter is back to showing all types.

---

### User Story 2 - Scannable Log Rows (Priority: P1)

Each collapsed log row is redesigned so the user can scan method, status, URL, and type at a glance, then copy cURL or expand for detail. The previous two-line dense dump (time + method + status + type on one line, URL on the next, unlabeled) is replaced by a single compact row with clear visual roles for each field.

**Why this priority**: The type filter only helps if rows are readable. The current row is hard to scan when many types are mixed. This story can ship without the filter, but together they make the Logs tab usable.

**Independent Test**: Open a log with several rows. Without expanding, identify each row's method, status, type, and URL in one pass. Copy cURL from the collapsed row. Expand and still see headers and bodies.

**Acceptance Scenarios**:

1. **Given** at least one log row, **When** the user looks at the collapsed row, **Then** they can distinguish method, status (pending / code / failed), resource type, and URL without reading a single run-on line.
2. **Given** a long URL, **When** the user views the collapsed row, **Then** the URL truncates in place and the full URL is available on hover or in the expanded detail.
3. **Given** a collapsed row, **When** the user activates copy cURL, **Then** the command is copied without expanding, as today.
4. **Given** a collapsed row, **When** the user selects it, **Then** the existing detail (headers and bodies) opens below that row.
5. **Given** the compact popup width, **When** the list is shown, **Then** rows do not force horizontal scrolling of the popup; overflow is truncated or contained in the row.

---

### User Story 3 - Clear Multi-Select for Resource Types (Priority: P2)

Choosing more than one resource type is obvious and quick. Every standard type is an always-visible toggle. The user can see which types are on without opening a menu, add or remove types one by one, and do this both on the Logs view filter and on the profile’s existing resource-type capture filter (the Filters section on Headers). The two places use the same type names and the same select/deselect behavior.

**Why this priority**: Multi-select is already assumed for the Logs filter, and the Headers capture filter already allows multiple types, but both need a usable control. This story is independently testable as a UX upgrade even before the new Logs filter exists, by exercising the Headers capture filter.

**Independent Test**: On Headers, turn on XHR and Script toggles, confirm both stay selected and visible. Turn Script off; only XHR remains. Repeat the same add/remove pattern on the Logs type toggles and confirm the list follows the selection.

**Acceptance Scenarios**:

1. **Given** the user is choosing resource types, **When** they select a second type, **Then** the first type stays selected and both are shown as selected.
2. **Given** two types are selected, **When** they deselect one, **Then** only the remaining type stays selected; the control does not clear the whole set.
3. **Given** one or more types are selected, **When** the user looks at the filter without extra interaction, **Then** they can tell which types are active from the always-visible toggles.
4. **Given** the Logs tab or a Headers resource-type filter, **When** the user looks at the type controls, **Then** every standard type is visible as a toggle and each shows whether it is selected.
5. **Given** the Logs view filter and the Headers capture filter, **When** the user multi-selects types in either place, **Then** the select/deselect behavior and type names match.
6. **Given** the compact popup, **When** several types are selected, **Then** the control does not force horizontal scrolling of the popup.

---

### Edge Cases

- What happens when the log has only one type? The full type list is still shown. Choosing that one type or all looks the same in the list.
- What happens when a selected type has no rows (they were dropped by the 200-cap or never captured)? The list shows the filter-hidden empty state.
- What happens if a row has an unknown resource type? It appears under a catch-all “Other” type in the filter.
- What happens to the filter when the user switches profiles? Each profile has its own filter; a newly selected profile starts at “all types” unless it already has a remembered filter this session.
- What happens when recording is on and the user filters to XHR? Capture continues for every patched type; only the list is filtered.
- What happens to expand/copy on a filtered list? They still work on visible rows only.
- What happens if the user deselects the last remaining type on the Logs view filter? The filter is treated as all types (nothing accidentally hidden).
- What happens if the user deselects the last remaining type on the Headers capture filter? At least one type MUST remain selected so the capture filter does not become an empty type list (empty type group would mean “all types” in capture semantics and surprise the user).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Logs tab MUST provide a resource-type filter that the user can change without leaving the tab.
- **FR-002**: The filter MUST always present the full standard type list (document / main frame, sub frame, stylesheet, script, image, object, XHR, other), not only types that currently appear in the log. The user MUST be able to show all types or any subset of that list.
- **FR-003**: Applying the filter MUST change only which rows are displayed. It MUST NOT change recording on/off, MUST NOT delete entries, and MUST NOT change what is captured.
- **FR-004**: When the active filter matches no rows but the profile’s log is not empty, the empty state MUST say the type filter is hiding rows.
- **FR-005**: The type filter MUST be remembered per profile for the current browser session (popup close does not reset it). It MUST reset to all types when that profile’s log is cleared or the browser restarts.
- **FR-006**: Each collapsed log row MUST present method, status, resource type, and URL as separate, identifiable fields on one compact row.
- **FR-007**: Long URLs MUST truncate on the collapsed row; the full URL MUST remain available from the row (hover or expanded detail).
- **FR-008**: Copy cURL and expand-for-detail MUST remain available from the redesigned collapsed row without extra steps compared to today.
- **FR-009**: The redesigned row MUST stay usable at the compact popup width with no horizontal scrolling of the popup.
- **FR-010**: Status MUST remain readable at a glance for pending, HTTP codes, and failed.
- **FR-011**: This feature MUST NOT change how profiles, header rules, or captured log entries are stored, other than remembering the per-profile view filter for the session.
- **FR-012**: Resource-type multi-select (Logs view filter and Headers capture filter) MUST let the user add or remove individual types without losing other selected types.
- **FR-013**: Every standard resource type MUST be an always-visible toggle (Logs view filter and Headers capture filter). There is no open/close picker for choosing types.
- **FR-014**: Each type toggle MUST show selected vs unselected without further interaction. The Logs filter MUST include an explicit **All** toggle that is selected when every type is visible (`[]` in storage). Selecting a specific type turns All off and shows only that type (and any others then added). Selecting All again clears the subset (back to `[]`).
- **FR-015**: The Logs view filter and the Headers capture filter MUST use the same type names and the same add/remove behavior. Clearing the last Logs type means “all types”; the Headers capture filter MUST keep at least one type selected.
- **FR-016**: The multi-select control MUST fit the compact popup: no horizontal scrolling of the popup when several types are selected.

### Key Entities

- **Log Type Filter**: Per-profile view preference: which resource types are visible. Session-scoped. Default: all types. Independent of the profile’s capture filters.
- **Log Row (collapsed)**: One-line summary of a captured request: method, status, type, truncated URL, plus copy and expand actions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can hide non-XHR rows and confirm only XHR rows remain in at most 2 clicks after opening Logs.
- **SC-002**: Restoring “all types” brings back every previously hidden row for that profile with no re-recording.
- **SC-003**: In a list of 10 mixed-type rows, a tester can correctly name method, status, and type for any row in under 3 seconds without expanding it.
- **SC-004**: Copy cURL from a redesigned row still takes 1 click on the collapsed row.
- **SC-005**: 100% of captured entries remain in the log when the view filter changes.
- **SC-006**: A user can select two resource types and then remove one in at most 4 clicks, and the remaining type stays applied.
- **SC-007**: Without opening a menu, a tester can name every selected resource type from the visible toggles.

## Assumptions

- This is a view filter on the existing Logs tab from feature 003. Capture rules (profile URL/type filters, patched-only) stay as specified there.
- Resource type names match the vocabulary already offered in the profile filter editor, with unknown types grouped as Other. The filter always lists that full standard set, even when the log is empty or only contains one type.
- Default is show all types so a first-time Logs visit is not an empty filtered list.
- The filter is multi-select (any subset). On the Logs view filter, selecting none is treated as all, so users cannot accidentally hide everything. On the Headers capture filter, at least one type stays selected.
- The same always-visible multi-select toggles apply to the existing Headers “Filters → Resource Type” control, not only the new Logs view filter. A dropdown or hidden picker is out of scope.
- Row redesign stays inside the compact 002 chrome; no new popup width.
- Expand/detail, bodies, and cURL behavior from 003 are unchanged except for how the collapsed row looks.
