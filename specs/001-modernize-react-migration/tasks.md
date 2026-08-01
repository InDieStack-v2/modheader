# Tasks: Modernize ModHeader (MV3 + React/TypeScript Rewrite)

**Input**: Design documents from `/specs/001-modernize-react-migration/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: INCLUDED — FR-013 mandates a full unit + E2E suite (Clarification Q2).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- WXT extension layout at repo root: `entrypoints/`, `components/`, `lib/`, `tests/`, `assets/` (per plan.md)
- Legacy code lives in `src/` until T045 removes it after parity sign-off

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Initialize WXT + React + TypeScript project: create `wxt.config.ts`, `tsconfig.json` (strict), and rewrite `package.json` with dependencies `wxt`, `react`, `react-dom`, `@mui/material`, `@emotion/react`, `@emotion/styled`, `typescript` and scripts `dev`, `dev:firefox`, `build`, `zip`, `test`, `test:e2e`, `lint`; create `entrypoints/`, `components/`, `lib/`, `tests/unit/`, `tests/e2e/` directories per plan.md structure
- [X] T002 [P] Configure ESLint for TS/React in `eslint.config.mjs` (replace current JS-only config)
- [X] T003 [P] Configure Vitest in `vitest.config.ts` with `tests/unit/` include pattern and chrome-API mocks
- [X] T004 [P] Configure Playwright in `playwright.config.ts` with extension-loading fixtures for Chromium and Firefox plus a local header-echo server fixture in `tests/e2e/fixtures.ts`
- [X] T005 [P] Copy extension icons from `src/icon.png`, `src/icon_16.png`, `src/icon_48.png`, `src/icon_128.png`, `src/icon_bw.png` into `assets/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core libraries that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T006 Define shared model types (Profile, HeaderRule, Filter, RuntimeState, CloudBackup, UnsupportedNotice) in `lib/types.ts` per `specs/001-modernize-react-migration/data-model.md`
- [X] T007 Create `lib/constants.ts`: autocomplete header name lists (port from `src/scripts/main.js:413-505`), sync quota constants (8KB item / 7KB chunk / 50 snapshots), session-rule limit 5000, empty denied-header denylist
- [X] T008 [P] Write unit tests for profile operations in `tests/unit/profiles.test.ts` (create/clone/sort naming rules, wildcard→regex conversion from `contracts/profile-format.md`) — MUST FAIL before T010
- [X] T009 [P] Write unit tests for the DNR compiler in `tests/unit/dnr.test.ts` covering invariants 1–4 from `contracts/dnr-rules.md` (determinism, rule cap, RE2-safe legacy patterns, tabIds presence) — MUST FAIL before T011
- [X] T010 Implement `lib/profiles.ts`: createProfile, cloneProfile, sortProfiles, fixLegacyProfile (wildcard→regex port from `src/scripts/main.js:8-30`)
- [X] T011 Implement `lib/dnr.ts`: Profile + pause + lockedTabId → session rules + UnsupportedNotice[] per `contracts/dnr-rules.md`
- [X] T012 Implement `lib/storage.ts`: typed `chrome.storage.local` get/set helpers and `storage.onChanged` subscription for the RuntimeState keys in data-model.md
- [ ] T013 Run DNR capability spike on Chrome and Firefox: determine which headers cannot be modified and which legacy regexes fail RE2; encode results into the denied-header denylist in `lib/constants.ts` and the documented limitation list (SC-004) (partially done: docs-based denylist; real-browser spike pending)
- [X] T014 Create background skeleton `entrypoints/background.ts`: compile session rules via `lib/dnr.ts` on worker startup and on every relevant `storage.onChanged` event (atomic `updateSessionRules`)

**Checkpoint**: `lib/` complete with green unit tests; background compiles rules from storage — user story implementation can now begin

---

## Phase 3: User Story 1 - Extension Works on Current Browsers (Priority: P1) 🎯 MVP

**Goal**: Installable MV3 extension on current Chrome + Firefox that modifies request and response headers via declarativeNetRequest

**Independent Test**: Load built extension in both browsers, add a request header, verify it on a header-echo page (quickstart scenario 1)

### Implementation for User Story 1

- [X] T015 [US1] Configure MV3 manifest in `wxt.config.ts`: permissions `declarativeNetRequestWithHostAccess`, `storage`, `contextMenus`, `tabs`; `host_permissions: ["<all_urls>"]`; action with icons + popup; per-browser background (Chrome `service_worker`, Firefox event page) per research D3
- [X] T016 [US1] Implement badge state in `entrypoints/background.ts`: `action.setIcon`/`setBadgeText` for paused (⏸), zero-header (grey), locked-other-tab (🔒), and normal (header count) states — port logic from `src/background.js:331-353`
- [X] T017 [US1] Implement pause/lock context menus in `entrypoints/background.ts` — port from `src/background.js:282-329` and `src/background.js:386-395`, writing state via `lib/storage.ts`
- [X] T018 [US1] Implement active-tab URL tracking in `entrypoints/background.ts` using the `tabs` API (`onUpdated`, `onActivated`, `windows.onFocusChanged`) writing `activeTabUrl` to storage — port from `src/background.js:218-263`
- [X] T019 [US1] Build popup shell: `entrypoints/popup/index.html`, `entrypoints/popup/main.tsx`, `entrypoints/popup/App.tsx` with MUI theme; loads profiles + runtime state via `lib/storage.ts` and subscribes to changes
- [X] T020 [US1] Implement `components/HeaderTable.tsx`: editable enabled/name/value rows with add/remove-ensure-non-empty, autocomplete from `lib/constants.ts` — port behavior of the header section in `src/popup.html`
- [X] T021 [US1] Wire save-on-change in `entrypoints/popup/App.tsx`: every edit writes `storage.local` via `lib/storage.ts` so the background recompiles rules immediately (replaces legacy save-on-unload)
- [X] T022 [P] [US1] Write E2E test for request header modification in `tests/e2e/headers.spec.ts` (Playwright: load extension, set header, assert echo server receives it)
- [X] T023 [P] [US1] Write E2E test for response header modification in `tests/e2e/headers.spec.ts`
- [ ] T024 [US1] Manually verify quickstart scenarios 1–3 on Chrome and Firefox; record results in `specs/001-modernize-react-migration/checklists/parity.md`

**Checkpoint**: US1 fully functional — MV3 install + header modification works on both browsers

---

## Phase 4: User Story 2 - Full Feature Parity (Priority: P2)

**Goal**: All 13 existing features work identically: profiles, filters, comments, sorting, append mode, clone, import/export, cloud backup (with chunking fix), tab lock, pause, badge

**Independent Test**: Execute quickstart scenarios 4–8 against the built extension on both browsers

### Tests for User Story 2

- [X] T025 [P] [US2] Write unit tests for backup chunking in `tests/unit/backup.test.ts` (chunk/reassemble round-trip, legacy single-item snapshot read, quota-failure error surfacing, 50-snapshot retention) — MUST FAIL before T026

### Implementation for User Story 2

- [X] T026 [US2] Implement `lib/backup.ts`: chunked `chrome.storage.sync` backup/restore (`backup:<ts>:meta` + `backup:<ts>:<i>` keys), legacy single-item read, retention, per CloudBackup in data-model.md (FR-014)
- [X] T027 [P] [US2] Implement `components/ProfileList.tsx`: sidenav with create/clone/delete/switch and unique auto-naming — port `profileService` from `src/scripts/main.js:206-246`
- [X] T028 [P] [US2] Implement `components/FilterEditor.tsx`: URL filters (wildcard/regex with non-RE2 warning) and resource-type filters — port filter ops from `src/scripts/main.js:44-56` and filter UI in `src/popup.html`
- [X] T029 [P] [US2] Implement column sorting and comment column in `components/HeaderTable.tsx` — port SortingController (`src/scripts/main.js:529-540`) and `hideComment` toggle
- [X] T030 [P] [US2] Implement `components/SettingsDialog.tsx`: append mode selector and comment visibility — port `src/settings.tmpl.html`
- [X] T031 [P] [US2] Implement `components/ImportExportDialog.tsx`: export with `navigator.clipboard.writeText` (replaces deprecated `execCommand`), import with legacy `urlPattern` conversion and failure toast — port `src/exportdialog.tmpl.html` + `src/importdialog.tmpl.html` per `contracts/profile-format.md`
- [X] T032 [US2] Implement `components/CloudBackupDialog.tsx`: list/restore snapshots (old + chunked formats) via `lib/backup.ts` — port `src/cloudbackupdialog.tmpl.html`; surface backup failures via Snackbar (FR-014)
- [X] T033 [P] [US2] Implement pause/lock controls, unsupported-header notices (from `UnsupportedNotice` in `lib/dnr.ts`), and rotating tips Snackbar in `entrypoints/popup/App.tsx` — port `src/scripts/main.js:82-124,561-604` and `src/footer.tmpl.html`
- [X] T034 [P] [US2] Write E2E parity tests in `tests/e2e/parity.spec.ts`: profile switch applies correct rules, URL filter scoping, pause stops modification, tab lock scoping, import/export round-trip
- [X] T035 [P] [US2] Write E2E cloud backup test in `tests/e2e/backup.spec.ts`: >8KB profile chunked round-trip and legacy-format snapshot restore
- [ ] T036 [US2] Manually verify quickstart scenarios 4–8 on Chrome and Firefox; record in `specs/001-modernize-react-migration/checklists/parity.md`

**Checkpoint**: US1 + US2 both work — feature parity achieved on both browsers

---

## Phase 5: User Story 3 - Existing User Data Preserved on Upgrade (Priority: P2)

**Goal**: Upgrade from ModHeader 2.3.2 preserves all profiles/settings automatically, working even if the user never opens the popup

**Independent Test**: Install 2.3.2, create profiles, upgrade to the new build, verify data and immediate header modification (quickstart scenario 9)

### Tests for User Story 3

- [X] T037 [P] [US3] Write unit tests for migration in `tests/unit/migration.test.ts`: legacy `localStorage` fixtures (profiles, selectedProfile, isPaused, lockedTabId, legacy urlPattern filters) → `storage.local` with zero data loss — MUST FAIL before T038

### Implementation for User Story 3

- [X] T038 [US3] Implement `lib/migration.ts`: read legacy localStorage keys, transform via `fixLegacyProfile` in `lib/profiles.ts`, write RuntimeState keys via `lib/storage.ts`, set `migrationDone` (idempotent)
- [X] T039 [US3] Implement migration trigger in `entrypoints/background.ts`: on `onInstalled`, Chrome opens an offscreen document (`entrypoints/migration/index.html`) that runs `lib/migration.ts`; Firefox event page runs it directly — per research D5
- [X] T040 [P] [US3] Write E2E upgrade test in `tests/e2e/migration.spec.ts`: seed legacy localStorage with 2.3.2-format data, load new build, assert profiles/settings present and headers modified without opening popup
- [ ] T041 [US3] Manually verify quickstart scenario 9 (real upgrade from 2.3.2) on Chrome and Firefox; record in `specs/001-modernize-react-migration/checklists/parity.md`

**Checkpoint**: US3 complete — zero-data-loss upgrade verified

---

## Phase 6: User Story 4 - Maintainable Modern Codebase (Priority: P3)

**Goal**: No EOL dependencies, no deprecated APIs, single-command dual-browser packaging, constitution and docs aligned

**Independent Test**: Dependency audit + `npm run zip` produces both store packages (quickstart build section)

### Implementation for User Story 4

- [X] T042 [US4] Consolidate packaging in `package.json` + `wxt.config.ts`: `npm run build` and `npm run zip` produce Chrome/Firefox outputs; verify zips exclude junk files (FR-010); delete superseded `scripts/build.mjs`
- [X] T043 [P] [US4] Run dependency audit (no EOL/unmaintained runtime deps — FR-006: AngularJS and Angular Material gone) and record results in `README.md`
- [X] T044 [P] [US4] Verify no deprecated APIs remain (`execCommand`, `browserAction`, Chrome-72 sniffing — FR-007) and delete `src/styles/_DS_Store`
- [ ] T045 [US4] Delete legacy `src/` directory (only after T024, T036, T041 sign-off recorded in `checklists/parity.md`)
- [X] T046 [P] [US4] Update `README.md`: new dev/build/test/zip commands, MV3 architecture summary, remove obsolete "no build tools" installation section
- [X] T047 [US4] Amend `.specify/memory/constitution.md` to v2.0.0 (redefine Principles I, IV, V for build tooling, npm deps, automated tests) with Sync Impact Report per governance rules (completed via /skill:speckit-constitution — v2.0.0 ratified 2026-07-31)

**Checkpoint**: US4 complete — codebase fully modernized and governance aligned

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Release validation across all stories

- [X] T048 Run full unit (`npm run test`) and E2E (`npm run test:e2e`) suites on Chromium and Firefox; fix all failures
- [X] T049 [P] Verify `npm run lint` and `tsc --noEmit` are clean
- [ ] T050 Execute all 10 manual scenarios in `specs/001-modernize-react-migration/quickstart.md` on both browsers; record final parity sign-off in `checklists/parity.md` (SC-002, SC-004)
- [ ] T051 Install from produced zips on both browsers and confirm no deprecated-platform warnings (SC-001 readiness) and popup opens interactively in <300ms

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational - delivers the MVP
- **US2 (Phase 4)**: Depends on US1 popup/background skeleton (T019–T021) - extends same components
- **US3 (Phase 5)**: Depends on Foundational libs only (T010, T012) - can run parallel to US1/US2 after Phase 2
- **US4 (Phase 6)**: Depends on US1–US3 sign-offs (T045 ordering)
- **Polish (Phase 7)**: Depends on all user stories

### User Story Dependencies

- **US1 (P1)**: Starts after Foundational; no story dependencies
- **US2 (P2)**: Builds on US1's popup shell and background; not independent of US1
- **US3 (P2)**: Independent of US1/US2 — only needs Foundational libs; parallelizable
- **US4 (P3)**: Cleanup/rollup story; strictly after US1–US3 verification

### Within Each User Story

- Tests (included per FR-013) MUST be written and FAIL before implementation
- Libraries (`lib/`) before UI components before wiring
- E2E tests after the flow they exercise is implemented
- Manual quickstart verification closes each story

### Parallel Opportunities

- T002–T005 (Setup configs) in parallel
- T008 + T009 (foundational unit tests) in parallel
- T022 + T023 (US1 E2E tests) in parallel
- T027–T031 + T033 (US2 components, different files) in parallel
- T034 + T035 (US2 E2E tests) in parallel
- T037 + T040 (US3 tests) can start right after Phase 2, parallel to US1/US2
- T043 + T044 + T046 (US4 audits/docs) in parallel

---

## Parallel Example: User Story 2

```bash
# Launch independent US2 component tasks together (different files):
Task: "Implement ProfileList.tsx: sidenav with create/clone/delete/switch"
Task: "Implement FilterEditor.tsx: URL and resource-type filters"
Task: "Implement SettingsDialog.tsx: append mode + comment visibility"
Task: "Implement ImportExportDialog.tsx with navigator.clipboard"

# Then E2E tests in parallel once flows exist:
Task: "E2E parity tests in tests/e2e/parity.spec.ts"
Task: "E2E cloud backup test in tests/e2e/backup.spec.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: T024 manual checks on both browsers
5. A working MV3 ModHeader with basic header modification is deployable at this point

### Incremental Delivery

1. Setup + Foundational → foundation ready (libs unit-tested)
2. + US1 → MV3 header modification works (MVP!)
3. + US2 → full feature parity incl. chunked cloud backup
4. + US3 → safe upgrade path for existing users (can overlap with US2)
5. + US4 → legacy removal, governance, docs → release candidate

### Parallel Team Strategy

1. Team completes Setup + Foundational together
2. After Foundational: Dev A → US1 (background+manifest), Dev B → US3 (migration, independent)
3. After US1 skeleton lands: Dev C → US2 components in parallel
4. US4 and Polish are single-owner sequential

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- T013 spike gates the SC-004 documented-limitation list — do not skip
- T045 (delete legacy `src/`) is irreversible-ish; parity sign-offs T024/T036/T041 are its hard gate
- Constitution amendment T047 is governance-required, not optional (plan.md Constitution Check)
- Commit after each task or logical group
