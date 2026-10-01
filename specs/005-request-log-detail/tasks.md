---

description: "Task list for feature implementation"
---

# Tasks: Expandable Request Log Detail

**Input**: Design documents from `/specs/005-request-log-detail/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: REQUIRED (constitution Principle V). Write failing tests before the matching implementation.

**Organization**: By user story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependency)
- **[Story]**: US1 / US2 / US3 — omit on Setup, Foundational, and Polish

## Path Conventions

- WXT: `components/`, `lib/`, `public/`, `entrypoints/`, `tests/unit/`, `tests/e2e/`

## Phase 1: Setup

**Purpose**: Confirm 003/004 baseline before capture/UI work

- [X] T001 Verify `npm run compile && npm run lint && npm run test` is green on the current tree

---

## Phase 2: Foundational

**Purpose**: Body-attach matcher used by live expand (US1 FR-005) and capture (US2). Blocks story work that merges hook payloads.

**⚠️ CRITICAL**: Complete before user stories

- [X] T002 Write failing unit tests in `tests/unit/request-match.test.ts` for `pickEntryForBody`: completed (non-pending) rows match; 10s window; skip rows whose target body is already `text`/`binary`; oldest `startedAt` then lowest `id`; relative URL after `sanitizeLogUrl` of an absolute hook URL; default `which` is `'response'`
- [X] T003 Implement `pickEntryForBody(entries, input, which?: 'request' | 'response')` in `lib/request-match.ts` per `specs/005-request-log-detail/contracts/request-log.md` (no `pending` requirement; 10s window; `which` selects which body must still be empty/unavailable)

**Checkpoint**: `npm run test` — new `pickEntryForBody` cases pass.

---

## Phase 3: User Story 1 - Expand a Log Row to Open Detail (Priority: P1) 🎯 MVP increment

**Goal**: One in-place expanded row; collapse on second click or another row; copy cURL does not expand; expand resets when leaving Requests, switching profile, clearing, or the row disappears.

**Independent Test**: Two patched rows — expand first, expand second (first closes), collapse, copy cURL stays collapsed, Headers → Requests is all-collapsed (`specs/005-request-log-detail/quickstart.md` scenario 1).

### Tests for User Story 1

- [X] T004 [US1] Extend `tests/e2e/request-log.spec.ts`: with two log rows, click row 1 (not cURL) → detail visible; click row 2 → only row 2 detail; click row 2 again → collapsed; copy cURL does not set `aria-expanded`; switch to Headers and back → no expanded detail

### Implementation for User Story 1

- [X] T005 [US1] Reset expand in `entrypoints/popup/App.tsx`: `setExpandedLogId(null)` when `workspaceTab` leaves `'logs'`, when `selectedProfileIndex` changes, and when `onClear` runs; if `expandedLogId` is not in the visible entries for the active type filter, clear it
- [X] T006 [US1] Confirm collapsed-row expand in `components/RequestLogList.tsx`: row button toggles `onExpand`, copy-cURL `IconButton` does not call `onExpand`, `aria-expanded` reflects open state, `RequestLogDetail` renders only when `expandedId === entry.id`, list still scrolls inside the tab

**Checkpoint**: US1 independently testable even if bodies are still empty.

---

## Phase 4: User Story 2 - Verify Request and Response Bodies (Priority: P1)

**Goal**: Page-initiated XHR/fetch on already-open tabs actually store request and response bodies; expanded detail shows them (not empty/unavailable when they existed).

**Independent Test**: Open a page first, Start recording (no reload), `fetch` POST JSON to a matching echo, expand the row — both bodies readable (`quickstart.md` scenario 2 / SC-009).

### Tests for User Story 2

- [X] T007 [US2] Add e2e in `tests/e2e/request-log.spec.ts`: create a matching profile; open `echoServer` page **before** Start; Start recording; from that page `fetch` POST JSON; expand the xhr row; assert request body and response body text are visible (not “No body” / “not available”); GET case shows request “No body”

### Implementation for User Story 2

- [X] T008 [P] [US2] Update `public/request-log-main.js`: resolve URL with `new URL(raw, location.href).href`; at send post request payload (string / URLSearchParams / string-only FormData; Blob/ArrayBuffer via text when UTF-8; else `requestBodyKind: 'binary'`); at settle post response text (empty → `empty`); keep install guard; do not run in a service-worker global
- [X] T009 [P] [US2] Forward new fields (`requestBody`, `requestBodyKind`, `responseBody`, `responseBodyKind`) in `public/request-log-hook.js` on `modheader:request-log-body`
- [X] T010 [US2] Update `handleLogBodyMessage` in `lib/request-log-observer.ts` to attach request and/or response via `pickEntryForBody(..., 'request'|'response')`, `captureText` / explicit kind, `mergeLogEntry`, `appendOrUpdateEntry`; still invent no row; ignore when selected profile is not recording
- [X] T011 [US2] Add `injectHookIntoOpenTabs` in `lib/request-log-observer.ts` and call it from `syncRequestLogHook` when any profile is recording: `tabs.query`, skip non-web schemes, `executeScript` MAIN `request-log-main.js` then isolated `request-log-hook.js` with `allFrames: true` and `injectImmediately: true`, swallow per-tab errors; unregister content scripts only when recording is fully off

**Checkpoint**: Already-open-tab POST shows both bodies in the existing detail panels.

---

## Phase 5: User Story 3 - Enhanced Request Log Detail (Priority: P2)

**Goal**: Labeled Overview + Request + Response; JSON pretty-print for display; per-body copy of stored text.

**Independent Test**: Expand a completed XHR — identify overview fields and each side without a run-on dump; copy request body and response body separately (`quickstart.md` scenario 3).

### Tests for User Story 3

- [X] T012 [P] [US3] Add failing unit tests in `tests/unit/body-format.test.ts`: object/array JSON pretty-prints with 2-space indent; invalid JSON, primitives, and empty string return unchanged; never throws
- [X] T013 [US3] Extend `tests/e2e/request-log.spec.ts`: expanded detail exposes Overview (method, URL, status), Request headers+body, Response headers+body; copy on a text body snackbars success; copy on empty/unavailable does not silently succeed

### Implementation for User Story 3

- [X] T014 [US3] Add `formatBodyForDisplay` in `lib/body-format.ts` per `specs/005-request-log-detail/contracts/request-log.md` so T012 passes
- [X] T015 [US3] Redesign `components/RequestLogDetail.tsx` per `specs/005-request-log-detail/contracts/ui-components.md`: Overview, Request (headers + body), Response (headers + body / waiting); display `formatBodyForDisplay`; truncated marker; `onCopyBody` copies **stored** text; empty/binary/unavailable copy reports “No text to copy.”; truncated copy mentions truncated; local scroll, no horizontal popup scroll
- [X] T016 [US3] Pass `onCopyBody={notify}` from `components/RequestLogList.tsx` (or `entrypoints/popup/App.tsx`) into `RequestLogDetail` using the existing snackbar path

**Checkpoint**: US1–US3 independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Full validation across stories

- [X] T017 Run `specs/005-request-log-detail/quickstart.md` automated commands and Chromium scenarios 1–3; `npm run compile && npm run lint && npm run test && npx playwright test --project=chromium` green (existing tabbar/parity/request-log still pass)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: None
- **Foundational (Phase 2)**: After T001 — BLOCKS US2 (and US1 live body refresh)
- **US1 (Phase 3)**: After Setup; can start while T002/T003 run if staffed (expand UI does not need the matcher)
- **US2 (Phase 4)**: After T003; hook files (T008/T009) before T010/T011
- **US3 (Phase 5)**: After US1 expand host; can overlap US2 (different files except `RequestLogDetail.tsx` if US2 only uses existing panels)
- **Polish**: After desired stories

### User Story Dependencies

- **US1**: No dependency on US2/US3
- **US2**: Needs T003; independent of US3 layout
- **US3**: Needs US1 expand; nicer if US2 already fills bodies

### Within Each User Story

- Tests MUST fail before implementation
- Hook JS before observer attach
- Inject after hook files exist
- Formatter before detail redesign

### Parallel Opportunities

- T008 ∥ T009 (two hook files)
- T012 ∥ T013 (unit vs e2e for US3)
- US1 (T004–T006) ∥ Foundational (T002–T003)
- US3 formatter (T012/T014) ∥ US2 hook work (different files)

---

## Parallel Example: User Story 2

```bash
# After T003 and T007:
Task: "Update public/request-log-main.js (T008)"
Task: "Forward fields in public/request-log-hook.js (T009)"

# Then sequential:
Task: "handleLogBodyMessage in lib/request-log-observer.ts (T010)"
Task: "injectHookIntoOpenTabs in lib/request-log-observer.ts (T011)"
```

---

## Implementation Strategy

### MVP First (US1 + US2)

Expand alone is already mostly shipped; the user cannot verify payloads without US2.

1. Phase 1 + Phase 2 (matcher)
2. Phase 3 US1 (expand reset) — optional to ship alone
3. Phase 4 US2 (capture) — **this is the value**
4. **STOP and VALIDATE** quickstart scenario 2
5. Phase 5 US3 (detail polish)

### Incremental Delivery

1. Setup + Foundational → attach rules ready
2. US1 → expand/collapse correct
3. US2 → bodies actually present
4. US3 → scannable detail + copy body
5. Polish → full suite green

### Parallel Team Strategy

1. Shared: T001–T003
2. Then: A = US1, B = US2 hook files, C = US3 formatter
3. B finishes observer inject; C finishes detail once expand exists

---

## Notes

- Do not add permissions or npm packages
- Do not change Profile documents, export, or backup
- Do not invent log rows from unmatched hook messages
- Service-worker and non-XHR response bodies may stay `unavailable`
- Restricted pages: inject errors are swallowed
- Collapsed row scan (004) and type filter stay as-is
- Copy cURL stays on the collapsed row and still uses stored request text
