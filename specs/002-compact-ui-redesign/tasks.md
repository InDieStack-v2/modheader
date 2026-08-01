---

description: "Task list for feature implementation"
---

# Tasks: Compact Profile-Tab UI Redesign

**Input**: Design documents from `/specs/002-compact-ui-redesign/`

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

**Purpose**: Baseline verification before touching the popup

- [X] T001 Verify baseline green on a clean checkout: run `npm install && npm run compile && npm run lint && npm run test && npm run test:e2e` and confirm all pass before any change

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Pure profile-list logic that the tab bar and App reorder flow depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 [P] Add pure `reorderProfiles(profiles: Profile[], from: number, to: number): Profile[]` helper to `lib/profiles.ts` — returns a new array with the element moved `from` → `to`, input not mutated, indices clamped, `from === to` returns an equivalent copy (contract in `specs/002-compact-ui-redesign/data-model.md`)
- [X] T003 [P] Add unit tests for `reorderProfiles` in `tests/unit/profiles.test.ts` — middle move, move to start, move to end, `from === to` no-op, out-of-range clamping, input array not mutated; tests written alongside the helper per Constitution V

**Checkpoint**: `npm run test` passes with the new helper covered — user story implementation can now begin

---

## Phase 3: User Story 1 - Compact Editing Workspace by Default (Priority: P1) 🎯 MVP

**Goal**: Popup opens directly into a compact, minimalist workspace focused on the active profile's header rules — no drawer, no AppBar chrome, no tips/donate prompts; paused/tab-lock state shown as compact indicators

**Independent Test**: Open the popup (`npm run dev`, load `.output/chrome-mv3`) — it shows the compact workspace immediately with ≥5 header rows visible without scrolling and all header-editing actions functional (spec US1 scenarios, SC-002/SC-003)

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T004 [US1] Update `tests/e2e/parity.spec.ts` for the compact layout: replace drawer/☰ "Profile menu" selectors with the new layout, assert the popup opens directly into the workspace (no drawer step), assert rotating tip and donate/review prompts never appear, and assert ≥5 header rows are visible at the default popup size

### Implementation for User Story 1

- [X] T005 [US1] Rebuild `entrypoints/popup/App.tsx` layout per `specs/002-compact-ui-redesign/contracts/ui-components.md`: remove AppBar, profile-name TextField, TIPS array and tip Snackbar prompts; add compact toolbar with pause/play + tab-lock icon buttons and the `⋮` menu; replace full-width paused/tab-lock Alerts with compact inline status chips with one-click undo (FR-001, FR-002, FR-012, FR-013). NOTE: keep the ☰ drawer toggle (moved into the compact toolbar) and the existing `Drawer`/`ProfileList` as the interim profile-switch UI for this increment — they are removed by T011 once the tab bar replaces them.
- [X] T006 [P] [US1] Compact density pass on `components/HeaderTable.tsx`: `size="small"` controls, reduced cell padding, keep add/edit/delete/enable/sort fully functional (FR-003)
- [X] T007 [P] [US1] Compact density pass on `components/FilterEditor.tsx`: minimal collapsible presentation, `size="small"` controls, same functionality (FR-003)
- [X] T008 [P] [US1] Apply theme density tweaks in `entrypoints/popup/main.tsx`: smaller typography scale and default component paddings via the existing MUI theme (research R5 — standard MUI density props only, no custom design system)

**Checkpoint**: US1 fully functional — popup opens compact, all editing works, `npm run test:e2e` parity suite green with the new layout

---

## Phase 4: User Story 2 - Profile Switching via Left Tab Bar (Priority: P2)

**Goal**: Profiles shown as an always-visible vertical tab bar on the left; one active at a time; create/rename/duplicate/delete-with-undo/drag-reorder all available from the tab bar; last active profile restored on reopen

**Independent Test**: Create three profiles and exercise the tab bar per `specs/002-compact-ui-redesign/quickstart.md` scenario 2 — 1-click switching, inline rename, drag-reorder persistence, delete with working Undo, last-profile delete blocked, overflow scrolling, arrow-key navigation (spec US2 scenarios, SC-001)

### Tests for User Story 2

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T009 [US2] Add `tests/e2e/tabbar.spec.ts` covering tab bar flows: 1-click profile switch with correct rules shown, create selects new tab, rename via tab interaction (duplicate names accepted), duplicate, drag-reorder persists across popup reopen and keeps active profile active, delete shows Undo snackbar and Undo restores profile at original index, Delete disabled for last profile, keyboard arrow navigation between tabs

### Implementation for User Story 2

- [X] T010 [US2] Create `components/ProfileTabBar.tsx` per the props + behavioral contract in `specs/002-compact-ui-redesign/contracts/ui-components.md`: MUI `Tabs orientation="vertical"` with one `Tab` per profile, selected-tab indicator (FR-006), title truncation with tooltip, internal scrolling (FR-009), inline rename on double-click/context-menu with Enter/blur commit and Escape cancel, per-tab context menu (Rename / Duplicate / Delete — Delete disabled when one profile remains, FR-010), HTML5 drag-and-drop calling `onReorder` (research R1), "+ New profile" control, roving-tabindex arrow-key navigation from MUI Tabs (FR-016)
- [X] T011 [US2] Wire `ProfileTabBar` into `entrypoints/popup/App.tsx`: left-edge placement beside the workspace; `onSelect` persists `selectedProfileIndex` (FR-008); `onCreate`/`onDuplicate` append and select; `onRename` updates `title` via `saveProfile`; `onReorder` uses `reorderProfiles` and recomputes `selectedProfileIndex` so the active profile follows; `onDelete` removes the profile, selects the nearest remaining one, and holds it in an `undoBuffer`; render Undo `Snackbar` (~5s auto-hide) that re-inserts at the original index and re-selects (FR-017); remove the interim ☰ drawer toggle and `Drawer` from the toolbar, remove Delete/Clone items from the `⋮` menu; delete `components/ProfileList.tsx`

**Checkpoint**: US2 fully functional — tab bar manages all profile lifecycle actions, `tests/e2e/tabbar.spec.ts` green, no references to `ProfileList` remain (`npm run compile && npm run lint`)

---

## Phase 5: User Story 3 - Minimalist Visual Style (Priority: P3)

**Goal**: Single accent color, functional icons only, no decorative elements; all secondary features reachable from the single `⋮` overflow menu

**Independent Test**: Visual pass per `specs/002-compact-ui-redesign/quickstart.md` scenario 3 — the `⋮` menu contains Profile settings, Import profile, Export profile, Cloud backup, and each opens its working dialog; no banners, tip carousels, or promotional links in the default view (spec US3 scenarios, SC-005)

### Implementation for User Story 3

- [X] T012 [US3] Consolidate secondary features in `entrypoints/popup/App.tsx`: add Cloud backup to the `⋮` overflow menu (opening the existing `CloudBackupDialog`), verify Profile settings / Import / Export items all work from the menu (FR-011); remove the now-unused `onOpenCloudBackup`/`openLink` wiring left over from `ProfileList`
- [X] T013 [US3] Minimalist visual pass across `entrypoints/popup/App.tsx` and `components/ProfileTabBar.tsx`: single accent color, icon-only functional buttons with `aria-label`s, consistent alignment and spacing; confirm every remaining element maps to a functional requirement (FR-013, SC-005)

**Checkpoint**: US3 complete — minimalist style verified against quickstart scenario 3, all dialogs reachable from the one menu

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Full-suite verification and cross-browser sign-off

- [X] T014 [P] Run `npm run compile && npm run lint && npm run test` and fix any failures
- [X] T015 Run full `npm run test:e2e` and fix any failures across all specs
- [X] T016 Manual quickstart validation on Chrome: execute all three scenarios in `specs/002-compact-ui-redesign/quickstart.md` against `npm run dev` (`.output/chrome-mv3`)
- [ ] T017 Manual quickstart validation on Firefox: repeat all scenarios against `npm run dev:firefox` (`.output/firefox-mv3`), focusing on drag-and-drop reorder and keyboard navigation (Constitution II)
- [X] T018 [P] Review `README.md` for popup-UI descriptions/screenshots made stale by the redesign (drawer, tips, profile panel) and update them to the compact tab-bar layout

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories (US2's reorder needs `reorderProfiles`)
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - **US2 depends on US1's App.tsx rebuild (T005)** in practice: both stories edit `entrypoints/popup/App.tsx`, so they run sequentially — US2's independent test still stands alone once US1's layout exists
  - US3 depends on US2 (operates on the wired tab bar and final menu contents)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Start after US1 (shared `App.tsx` file); independently testable via its own tab bar flows
- **User Story 3 (P3)**: Start after US2 (final menu contents + tab bar visuals); independently testable via visual/menu checks

### Within Each User Story

- Tests MUST be written and FAIL before implementation (Constitution V)
- Component contract (`ProfileTabBar`) before its wiring into `App.tsx`
- Story complete (checkpoint green) before moving to next priority

### Parallel Opportunities

- T002 and T003 (helper + its tests, different files) in parallel
- T006, T007, T008 (three different files) in parallel within US1
- T014 and T018 (verification + docs, no code conflict) in parallel within Polish

---

## Parallel Example: User Story 1

```bash
# After T004 (e2e update) and T005 (App.tsx rebuild) are done,
# launch the three density passes together (different files):
Task: "Compact density pass on components/HeaderTable.tsx"
Task: "Compact density pass on components/FilterEditor.tsx"
Task: "Apply theme density tweaks in entrypoints/popup/main.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (baseline green)
2. Complete Phase 2: Foundational (`reorderProfiles` + tests)
3. Complete Phase 3: User Story 1 (compact workspace)
4. **STOP and VALIDATE**: popup opens compact, editing works, parity e2e green
5. Demo-ready MVP — profile switching still works in this increment via the interim ☰ drawer (kept by T005); US2 replaces it with the tab bar and removes the drawer (T011)

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. Add User Story 1 → compact layout, validate independently (MVP)
3. Add User Story 2 → tab bar replaces menu-based profile management, validate independently
4. Add User Story 3 → final minimalist polish, validate independently
5. Polish phase → cross-browser sign-off per Constitution II/V

### Parallel Team Strategy

Single-file coupling on `entrypoints/popup/App.tsx` (US1 → US2 → US3) makes full story parallelism impractical; parallelize within stories instead (see Parallel Opportunities above).

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable (checkpoints above)
- Verify e2e tests fail before implementing the layout they target
- Commit after each task or logical group
- Stop at any checkpoint to validate a story independently
- No new npm dependencies anywhere in this feature (Constitution IV; research R1)
