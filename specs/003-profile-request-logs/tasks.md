---

description: "Task list for feature implementation"
---

# Tasks: Profile Request Logs

**Input**: Design documents from `/specs/003-profile-request-logs/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Test tasks are REQUIRED — the project constitution (Principle V, Test Discipline) mandates unit tests for `lib/` logic and e2e tests for major user flows.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- WXT single project: popup in `entrypoints/popup/`, components in `components/`, logic in `lib/`, tests in `tests/unit/` and `tests/e2e/` (see plan.md "Project Structure")

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Permissions and shared types before any UI or observer work

- [X] T001 Verify baseline green: `npm run compile && npm run lint && npm run test && npm run test:e2e`
- [X] T002 Add `webRequest` and `scripting` to `permissions` in `wxt.config.ts` (both browsers). Do not add `webRequestBlocking`, `debugger`, or `declarativeNetRequestFeedback` (research D7)
- [X] T003 [P] Add `NameValue`, `BodyCapture`, `RequestLogEntry`, and `RequestLogState` types to `lib/types.ts` per `specs/003-profile-request-logs/data-model.md`. Do not add fields to `Profile` or `RuntimeState`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Session store + “would this profile patch this request?” predicate. All stories share these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 [P] Implement `sanitizeLogUrl` and `profileWouldPatch` in `lib/request-match.ts` per `specs/003-profile-request-logs/contracts/request-log.md` — same filter grouping as `compileProfileToRules` in `lib/dnr.ts` (URL OR, types OR, groups AND; paused / no enabled rules / tab-lock miss → false)
- [X] T005 [P] Unit tests for `sanitizeLogUrl` and `profileWouldPatch` in `tests/unit/request-match.test.ts` — strip userinfo/fragment; match/mismatch URL and type filters; empty filters apply everywhere; paused; no enabled rules; tab-lock
- [X] T006 Implement session log store in `lib/session-log.ts` per contract: `getRequestLogState`, `setRecording`, `appendOrUpdateEntry`, `clearEntries`, `remapOnReorder`, `dropAt`, `insertSlot`, `ensureSlots`, `subscribeRequestLog`. Prefer `browser.storage.session`; fall back to `storage.local` + wipe in a function the background will call from `runtime.onStartup`. Include a unit-testable `isSessionStoreAvailable()` (or equivalent) so Firefox without `storage.session` takes the local+onStartup path. Cap 200 newest-first; evict oldest if estimated payload would exceed 8 MB
- [X] T007 Unit tests for the session-log helpers in `tests/unit/session-log.test.ts` — upsert by id, 200-cap drop, remap on reorder, dropAt shifts indices, insertSlot at index leaves neighbors’ logs in place and inserts empty/off, recording default off; plus a case that the local fallback wipe function clears keys (mock `browser.storage` like existing unit tests)

**Checkpoint**: `npm run test` covers match + session-log. User stories can start.

---

## Phase 3: User Story 1 - Split Profile Workspace into Editor and Logs (Priority: P1) 🎯 MVP

**Goal**: Profile workspace has Headers | Logs tabs. Headers is the existing editor and is the default. Switching tabs does not change profile or lose edits.

**Independent Test**: Open the popup — two workspace tabs, Headers selected with filters + header tables; switch to Logs and back; editor intact; switching the left profile bar returns to Headers (spec US1).

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T008 [US1] Add `tests/e2e/request-log.spec.ts` US1 cases: Headers|Logs tabs visible, Headers selected by default, Headers still shows filter + header tables, Logs then Headers keeps typed header text, switching profile selects Headers again

### Implementation for User Story 1

- [X] T009 [US1] Add MUI workspace tabs **Headers | Logs** in `entrypoints/popup/App.tsx` per `specs/003-profile-request-logs/contracts/ui-components.md`. Default Headers on open and whenever `selectedProfileIndex` changes. Do not change `ProfileTabBar` or global pause
- [X] T010 [P] [US1] Add placeholder `components/RequestLogList.tsx` that accepts `RequestLogListProps` from the UI contract and renders a static empty/paused state (start control can be disabled until US2)
- [X] T011 [US1] Render `RequestLogList` on the Logs tab from `entrypoints/popup/App.tsx`

**Checkpoint**: US1 independently testable. `npm run test:e2e -- tests/e2e/request-log.spec.ts` US1 cases pass.

---

## Phase 4: User Story 2 - Opt-in Recording of Patched Requests (Priority: P1)

**Goal**: Start/pause recording per profile. While on, only patched, filter-matching requests for the **active** profile are stored. Survives popup close; resets on browser restart. Recording chip visible from Headers.

**Independent Test**: Quickstart scenario 2 — start, matching vs non-matching URL, pause, popup close, browser restart (spec US2).

### Tests for User Story 2

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T012 [US2] Extend `tests/e2e/request-log.spec.ts`: start control off by default; after start, a matching patched request appears and a non-matching one does not; pause adds no new rows; Recording chip visible on Headers

### Implementation for User Story 2

- [X] T013 [US2] In `entrypoints/background.ts`, add observe-only `webRequest` listeners (`onBeforeRequest`, `onSendHeaders` with `requestHeaders`+`extraHeaders`, `onHeadersReceived` with `responseHeaders`+`extraHeaders`, `onCompleted`, `onErrorOccurred`). If nothing is recording, return. If `profileWouldPatch` for the **selected** profile, `appendOrUpdateEntry` a pending/updated row (headers + status only; no bodies yet). Merge snapshot per research D2 (overlay this profile’s set/remove rules onto observed headers)
- [X] T014 [US2] On `runtime.onStartup` in `entrypoints/background.ts`, if using the local fallback, wipe request-log keys (session area needs no wipe)
- [X] T015 [US2] Wire start/pause + empty states in `components/RequestLogList.tsx` to `setRecording` / `subscribeRequestLog`. List may show method/URL/status rows (detail expand is US3)
- [X] T016 [US2] Add a **Recording** chip in the compact status row of `entrypoints/popup/App.tsx` when the active profile is recording (FR-022). Not clickable. Distinct from Paused
- [X] T017 [US2] In `entrypoints/popup/App.tsx` profile handlers: `ensureSlots` on load/create; `remapOnReorder` on reorder; `dropAt` on delete; `insertSlot` at the restored index on undo-delete (empty log, recording off — do not restore discarded entries); new/duplicate profiles start recording-off with an empty log

**Checkpoint**: US2 independently testable. Recording works with popup closed. Restart clears state.

---

## Phase 5: User Story 3 - Inspect and Manage Captured Logs (Priority: P2)

**Goal**: Newest-first list, expand for full header snapshot, clear without changing recording, live updates within 2s while Logs is open.

**Independent Test**: Record several requests, expand one, see post-mod headers, clear, recording still on, new rows appear live (spec US3).

### Tests for User Story 3

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T018 [US3] Extend `tests/e2e/request-log.spec.ts`: expand row shows request (and response when complete) headers including the profile’s patched header; Clear empties the list and leaves recording on; a new patched request appears within 2s while Logs stays open

### Implementation for User Story 3

- [X] T019 [P] [US3] Add `components/RequestLogDetail.tsx` — request/response header lists; waiting state while `status === 'pending'`
- [X] T020 [US3] Expand/select behavior + Clear control in `components/RequestLogList.tsx` (FR-015, FR-016). Collapsed row: time, method, truncated URL, resource type, status
- [X] T021 [US3] Confirm `subscribeRequestLog` is hooked in `entrypoints/popup/App.tsx` so Logs updates live without tab switch (FR-021)

**Checkpoint**: US3 independently testable on top of a recording session.

---

## Phase 6: User Story 4 - Inspect Bodies and Copy as cURL (Priority: P2)

**Goal**: Entry detail shows request/response bodies (text / empty / binary / unavailable / truncated). Each collapsed row has copy-cURL for the **patched** request with real header values.

**Independent Test**: Quickstart scenario 3 — POST JSON in/out visible; copy cURL from the collapsed row pastes method, URL, patched headers, `--data-raw` (spec US4).

### Tests for User Story 4

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T022 [P] [US4] Unit tests for `captureFromWebRequestBody` / `captureText` in `tests/unit/request-body.test.ts` — formData, raw UTF-8, invalid bytes → binary, empty, 64 KB truncate
- [X] T023 [P] [US4] Unit tests for `toCurl` in `tests/unit/curl.test.ts` — method, sanitized URL, `-H` real values including Cookie/Authorization, `--data-raw` for text, `bodyOmitted` for binary, no response body in the command
- [X] T024 [US4] Extend `tests/e2e/request-log.spec.ts`: expand a patched POST and assert request + response text bodies; click copy cURL on the collapsed row and assert clipboard contains method and URL (and `--data-raw` when the test server echoed a body)

### Implementation for User Story 4

- [X] T025 [P] [US4] Implement `lib/request-body.ts` per contract
- [X] T026 [P] [US4] Implement `lib/curl.ts` per contract (`toCurl`)
- [X] T027 [US4] In `entrypoints/background.ts` `onBeforeRequest`, set `requestBody` via `captureFromWebRequestBody`
- [X] T028 [US4] Add MAIN-world hook `entrypoints/request-log-hook.ts` that wraps `fetch` and `XMLHttpRequest` and sends `{ type: 'modheader:request-log-body', method, url, body, startedAt }`. Register/unregister with `browser.scripting.registerContentScripts` only while any profile is recording (research D3)
- [X] T029 [US4] In `entrypoints/background.ts`, handle `modheader:request-log-body` and attach `responseBody` using the contract tie-break: pending, same method + `sanitizeLogUrl`, `startedAt` within 2s, no body yet; oldest `startedAt` then lowest `id`; if none, do not invent a row (leave `unavailable`)
- [X] T030 [US4] Body panels in `components/RequestLogDetail.tsx` (text / empty / binary / unavailable / truncated / waiting). Non-XHR response bodies use `unavailable`
- [X] T031 [US4] Copy-cURL icon button on each collapsed row in `components/RequestLogList.tsx` — `navigator.clipboard.writeText`, existing snackbar; if `bodyOmitted`, say the body was skipped (FR-024, FR-025)

**Checkpoint**: US4 independently testable. `npm run test` + request-log e2e green.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Full quickstart, both browsers, no regressions

- [X] T032 Extend `tests/e2e/request-log.spec.ts` for global-pause (recording resets off, no new rows, Recording chip gone) and export/backup containing no log keys
- [X] T033 Run `specs/003-profile-request-logs/quickstart.md` automated commands and Chrome manual scenarios 1–3. On Firefox (`npm run dev:firefox`), confirm recording + a patched row, popup close keeps the log, full restart clears it (proves `storage.session` or local+onStartup fallback). Record the Firefox result in the PR/change description (Principle II)
- [X] T034 `npm run compile && npm run lint && npm run test && npm run test:e2e` all green; existing tabbar/parity/headers suites still pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **US1 (Phase 3)**: After Foundational — MVP
- **US2 (Phase 4)**: After Foundational; needs US1 tabs to surface start/pause
- **US3 (Phase 5)**: After US2 (needs real entries)
- **US4 (Phase 6)**: After US3 (needs expand + rows)
- **Polish (Phase 7)**: After US4

### User Story Dependencies

- **US1 (P1)**: After Phase 2 only
- **US2 (P1)**: After US1 UI shell (same popup)
- **US3 (P2)**: After US2 capture
- **US4 (P2)**: After US3 detail/list

### Parallel Opportunities

- T003 // T002 after T001
- T004 // T005 (write tests alongside, different files from T006)
- T006 then T007
- T010 // T009
- T019 // list work if staged
- T022 // T023 // T025 // T026

### Parallel Example: Foundational

```bash
# After T003:
Task: "profileWouldPatch + sanitizeLogUrl in lib/request-match.ts"
Task: "tests in tests/unit/request-match.test.ts"
# Then:
Task: "session store in lib/session-log.ts"
Task: "tests in tests/unit/session-log.test.ts"
```

### Parallel Example: User Story 4

```bash
Task: "lib/request-body.ts + tests/unit/request-body.test.ts"
Task: "lib/curl.ts + tests/unit/curl.test.ts"
# Then hook + background + UI
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 + 2
2. Phase 3 (Headers | Logs tabs)
3. **STOP and VALIDATE** US1 e2e
4. Demo: editor unchanged, Logs tab exists

### Incremental Delivery

1. US1 → tabs
2. US2 → start/pause + patched rows + recording chip
3. US3 → inspect headers + clear + live
4. US4 → bodies + copy cURL
5. Polish → quickstart + Firefox

### Suggested MVP scope

**US1 only** (workspace split). US2 is the first *useful* increment; ship US1+US2 together if demoing capture.

---

## Notes

- [P] = different files, no incomplete-task dependencies
- Do not put logs in `Profile` export or `storage.sync` backup
- Observer must no-op when recording is off
- Commit after each task or logical group
- Verify tests fail before implementing story test tasks
