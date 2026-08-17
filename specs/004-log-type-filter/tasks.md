---

description: "Task list for feature implementation"
---

# Tasks: Request Log Type Filter and Row Redesign

**Input**: Design documents from `/specs/004-log-type-filter/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: REQUIRED (constitution Principle V).

**Organization**: By user story.

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

- WXT: `components/`, `lib/`, `tests/unit/`, `tests/e2e/`

## Phase 1: Setup

**Purpose**: Confirm 003 baseline before UI work

- [X] T001 Verify `npm run compile && npm run lint && npm run test` is green on the current tree

---

## Phase 2: Foundational

**Purpose**: Shared type catalog, visibility helper, session filter slots. Blocks all stories.

**⚠️ CRITICAL**: Complete before user stories

- [X] T002 [P] Add `STANDARD_RESOURCE_TYPES`, `normalizeResourceType`, `visibleEntries`, and `toggleResourceType` in `lib/resource-types.ts` per `specs/004-log-type-filter/contracts/ui-components.md` (logs: last off → `[]`; capture: last type no-op)
- [X] T003 [P] Unit tests in `tests/unit/resource-types.test.ts` — normalize unknown → `other`; `visibleEntries` empty selected = all; subset filter; toggle logs/capture last-type rules
- [X] T004 Extend `lib/session-log.ts` with `requestLogTypeFilter: string[][]`: get/set, `ensureSlots` / `remapOnReorder` / `dropAt` / `insertSlot` keep this array aligned, `clearEntries` resets that profile’s filter to `[]`
- [X] T005 Unit tests in `tests/unit/session-log.test.ts` for type-filter remap/drop/insert/clear

**Checkpoint**: `npm run test` covers resource-types + session filter.

---

## Phase 3: User Story 1 - Filter the Log by Resource Type (Priority: P1) 🎯 MVP

**Goal**: Logs tab always-visible type toggles; view-only filter; empty-by-filter state; session memory.

**Independent Test**: Record mixed traffic, click XHR only, only XHR rows show; click again, all rows return; stored log unchanged (quickstart scenario 1).

### Tests for User Story 1

> Write first; they must fail before implementation

- [X] T006 [US1] Extend `tests/e2e/request-log.spec.ts`: after mixed main_frame + xhr rows, click the XHR type toggle and assert only xmlhttprequest rows; click **All** (or XHR again if that restores all) and assert both types return; recording stays on. Close and reopen the popup and assert the XHR-only filter is still applied (FR-005)

### Implementation for User Story 1

- [X] T007 [US1] Add `components/ResourceTypeToggles.tsx` per contract — always-visible **All** (logs mode only) plus small toggles for every standard type, `mode` logs|capture, wrap without page horizontal scroll
- [X] T008 [US1] Wire toggles into `components/RequestLogList.tsx`: read/write `requestLogTypeFilter[profileIndex]` via `lib/session-log.ts`, filter with `visibleEntries`, show “Hidden by resource type filter.” when stored entries exist but none are visible
- [X] T009 [US1] Subscribe/pass type filter from `entrypoints/popup/App.tsx` if the list cannot own session writes alone; keep profile create/delete/undo/reorder using the updated session-log helpers

**Checkpoint**: US1 independently testable.

---

## Phase 4: User Story 2 - Scannable Log Rows (Priority: P1)

**Goal**: One compact collapsed row: time, method, status, type, truncated URL, copy cURL.

**Independent Test**: Identify method/status/type/URL without expanding; copy cURL in 1 click; expand still works (quickstart scenario 2).

### Tests for User Story 2

- [X] T010 [US2] Extend `tests/e2e/request-log.spec.ts`: collapsed row exposes method, status, type, and URL as separate accessible names/text (not one run-on line); copy cURL still 1 click

### Implementation for User Story 2

- [X] T011 [US2] Redesign the collapsed row in `components/RequestLogList.tsx` per research D5: single flex row, status color (pending / 2xx / error), `shortLabel` type, URL `noWrap` + `title={fullUrl}`, copy cURL stays on the row, click body expands `RequestLogDetail`

**Checkpoint**: US2 independently testable on an unfiltered or filtered list.

---

## Phase 5: User Story 3 - Headers Capture Multi-Select (Priority: P2)

**Goal**: Headers Filters → Resource Type uses the same always-visible toggles; last type cannot be cleared.

**Independent Test**: Quickstart scenario 3 — select XHR+Script, deselect Script, last type sticks.

### Tests for User Story 3

- [X] T012 [US3] Add e2e coverage in `tests/e2e/request-log.spec.ts` (or `tests/e2e/filters.spec.ts`): on Headers, a type filter shows toggles not a listbox; selecting two types persists; deselecting the last remaining type leaves one selected

### Implementation for User Story 3

- [X] T013 [US3] Replace the multi `Select` in `components/FilterEditor.tsx` with `ResourceTypeToggles mode="capture"` bound to `filter.resourceType`; remove the local `RESOURCE_TYPES` copy (import from `lib/resource-types.ts`)

**Checkpoint**: Logs and Headers share one toggle component.

---

## Phase 6: Polish

- [X] T014 Run `specs/004-log-type-filter/quickstart.md` automated commands and Chromium scenarios 1–3; `npm run compile && npm run lint && npm run test && npx playwright test --project=chromium` green (existing tabbar/parity still pass)

---

## Dependencies & Execution Order

- Setup → Foundational (blocks all)
- US1 after Foundational (needs toggles + session filter)
- US2 after US1 list (same file `RequestLogList.tsx` — sequential)
- US3 after T007 (shared component); can overlap US2 if staffed
- Polish last

### User Story Independent Tests

- **US1**: XHR-only view filter, restore all, capture unchanged
- **US2**: scannable row + 1-click cURL
- **US3**: Headers capture toggles, last type locked

### Parallel

- T002 ∥ T003
- T004 then T005
- T012 can be written while T011 is in progress (different test cases)

### MVP

**US1** (type filter). Ship US1+US2 together for a usable Logs tab.

---

## Notes

- Do not change the 003 observer or `RequestLogEntry` shape
- Logs `[]` = all types; capture array length ≥ 1
- Profile tabs stay in the `Profiles` tablist (do not break tabbar e2e counts)
