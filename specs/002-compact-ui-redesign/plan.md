# Implementation Plan: Compact Profile-Tab UI Redesign

**Branch**: `002-compact-ui-redesign` | **Date**: 2026-08-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-compact-ui-redesign/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Redesign the extension popup into a compact, minimalist layout: profiles move from the
hidden drawer (`ProfileList`) to an always-visible vertical tab bar on the left edge,
exactly one profile active at a time, with tab-bar-native create/rename/duplicate/delete/
drag-reorder, delete-with-undo, and basic keyboard navigation. Secondary features
(settings, import/export, cloud backup) consolidate into the existing overflow menu;
rotating tips, donate/review prompts, and the drawer are removed from the default view.
The change is confined to the popup UI (`entrypoints/popup/`, `components/`); storage
schema, DNR rule compilation, and background behavior are untouched (FR-015), and no new
runtime dependencies are added — drag-and-drop uses native HTML5 drag events.

## Technical Context

**Language/Version**: TypeScript ~5.9.3 (strict), React 19.2

**Primary Dependencies**: WXT 0.21 (build), MUI 9.2 + Emotion (popup UI), `wxt/browser` (extension APIs)

**Storage**: `chrome.storage.local` via `lib/storage.ts` — schema unchanged (`RuntimeState.selectedProfileIndex` already persists the active profile)

**Testing**: Vitest 4 (`npm run test`, unit), Playwright 1.62 (`npm run test:e2e`, Chrome e2e), ESLint + `tsc --noEmit`

**Target Platform**: Chrome and Firefox extension popup, Manifest V3 (WXT-built)

**Project Type**: browser-extension (popup UI redesign)

**Performance Goals**: Popup interactive <1s from open (SC-002); ≥5 header rows visible at 720px width without scrolling (SC-003); no horizontal scroll at min popup width (SC-006)

**Constraints**: Fully offline/self-contained build (Constitution I); no new runtime dependencies (Constitution IV); minimal diff confined to popup UI (Constitution III); identical behavior on Chrome + Firefox (Constitution II)

**Scale/Scope**: 1 popup entrypoint (`entrypoints/popup/App.tsx`), ~7 existing components, 1 new component (`ProfileTabBar`), 1 component removed (`ProfileList`), existing e2e suites updated for new layout

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Modern Build Toolchain | Same WXT/Vite build; no runtime fetching introduced | ✅ PASS |
| II. Cross-Browser Compatibility | HTML5 drag events and MUI Tabs work on both Chrome and Firefox; e2e + manual verification on both browsers required before done | ✅ PASS (verification planned) |
| III. Simplicity & Minimal Change (YAGNI) | Change confined to popup UI; no speculative abstractions; native DnD instead of a DnD library | ✅ PASS |
| IV. Managed, Maintained Dependencies | No new dependencies; drag-and-drop implemented with native HTML5 drag events | ✅ PASS |
| V. Test Discipline | New pure logic (profile reorder helper) gets unit tests; tab-bar flows (switch/create/rename/duplicate/delete+undo/reorder/keyboard) get e2e tests; existing e2e tests referencing the drawer updated | ✅ PASS (tests planned alongside implementation) |

Post-design re-check: see "Constitution Check (post-design)" at the bottom — no violations, Complexity Tracking empty.

## Project Structure

### Documentation (this feature)

```text
specs/002-compact-ui-redesign/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── ui-components.md # Popup component contracts (props interfaces)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
entrypoints/popup/
├── App.tsx              # Rebuilt layout: left ProfileTabBar + compact workspace,
│                        #   consolidated overflow menu, undo-delete snackbar
├── index.html           # unchanged
└── main.tsx             # theme density tweaks only (if needed)

components/
├── ProfileTabBar.tsx    # NEW: vertical tab bar (MUI Tabs orientation="vertical"),
│                        #   DnD reorder, inline rename, tab context menu
├── HeaderTable.tsx      # Compact density pass (smaller paddings, size="small")
├── FilterEditor.tsx     # Compact density pass (collapsible/minimal presentation)
├── SettingsDialog.tsx   # unchanged (opened from overflow menu)
├── ImportExportDialog.tsx # unchanged (opened from overflow menu)
├── CloudBackupDialog.tsx  # unchanged (opened from overflow menu)
└── ProfileList.tsx      # REMOVED (replaced by ProfileTabBar)

lib/
├── profiles.ts          # ADD: reorderProfiles(profiles, from, to) pure helper
├── storage.ts           # unchanged (selectedProfileIndex already persisted)
└── types.ts             # unchanged (no schema changes)

tests/
├── unit/
│   └── profiles.test.ts # ADD: reorderProfiles cases
└── e2e/
    ├── tabbar.spec.ts   # NEW: tab bar flows (switch/create/rename/duplicate/
    │                    #   delete+undo/reorder/keyboard nav)
    └── parity.spec.ts   # UPDATED: selectors/flows for the new compact layout
```

**Structure Decision**: Existing WXT single-project layout is kept. The redesign is a
popup-only change: one new component (`components/ProfileTabBar.tsx`), a rebuilt
`entrypoints/popup/App.tsx`, compact-density passes on `HeaderTable`/`FilterEditor`,
removal of `components/ProfileList.tsx`, one pure helper added to `lib/profiles.ts`, and
new/updated tests. No background, storage-schema, or build changes.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations — this section is intentionally empty.

## Constitution Check (post-design)

Re-evaluated after Phase 0/1 artifacts (`research.md`, `data-model.md`, `contracts/`,
`quickstart.md`):

- **I** — PASS: artifacts introduce no runtime fetching; build unchanged.
- **II** — PASS: chosen techniques (MUI vertical Tabs, native HTML5 DnD, MUI Snackbar)
  are cross-browser; quickstart.md includes Chrome + Firefox manual verification.
- **III** — PASS: design reuses existing dialogs/state flow (`saveProfiles`,
  `selectedProfileIndex`); the only new logic is one pure reorder helper.
- **IV** — PASS: zero new dependencies (research.md R1).
- **V** — PASS: unit + e2e coverage planned for all new logic and flows.
