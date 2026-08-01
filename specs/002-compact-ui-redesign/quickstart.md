# Quickstart: Compact Profile-Tab UI Redesign — Validation Guide

**Date**: 2026-08-01 | **Feature**: `002-compact-ui-redesign`

Runnable scenarios proving the redesign works end-to-end. Component contracts referenced
below are in [contracts/ui-components.md](contracts/ui-components.md); state semantics in
[data-model.md](data-model.md).

## Prerequisites

```bash
npm install
```

## Automated checks (must all pass — Constitution V)

```bash
npm run compile     # tsc --noEmit
npm run lint        # eslint .
npm run test        # vitest: includes reorderProfiles unit cases
npm run test:e2e    # playwright: includes tests/e2e/tabbar.spec.ts + updated parity.spec.ts
```

## Manual scenario 1 — Compact workspace by default (US1, SC-002, SC-003)

1. `npm run dev`, then load the extension from `.output/chrome-mv3` and open the popup.
2. **Expected**: the popup opens directly into the compact layout — left tab bar plus the
   active profile's header tables; no drawer to open, no tip/donate prompts visible.
3. At the default popup width, count visible header rows: **≥5 without scrolling**.
4. Add, edit, toggle, and delete a header row; sort a column; add a filter.
   **Expected**: all work exactly as before (FR-003), edits persist after popup
   close/reopen.
5. **Expected**: the AppBar, profile-name toolbar field, full-width paused/tab-lock
   banners, and rotating tip are gone; paused/tab-lock state shows as compact indicators
   (FR-012, FR-013).

## Manual scenario 2 — Profile tab bar (US2, SC-001, FR-004..FR-010)

1. Create two more profiles via the "+ New profile" control.
   **Expected**: a new tab appears each time and becomes active.
2. Click between tabs. **Expected**: 1 click switches profiles; the active tab is clearly
   highlighted; each profile shows its own rules (SC-001).
3. Close and reopen the popup. **Expected**: the last active tab is still active (FR-008).
4. Double-click a tab label (or use its context menu → Rename), type a name, press Enter.
   **Expected**: the tab label updates; duplicate names are accepted without error.
5. Drag a tab to a new position. **Expected**: order changes and persists across popup
   reopen; the active profile stays active (FR-007).
6. Delete a profile via its context menu. **Expected**: the tab disappears immediately,
   the nearest profile becomes active, and a snackbar offers Undo for ~5 seconds; press
   Undo → the profile is restored at its original position and re-selected (FR-017).
7. Reduce to one profile. **Expected**: Delete is disabled in its context menu (FR-010).
8. Create ~15 profiles. **Expected**: the tab bar scrolls; its width and the workspace
   layout stay stable (FR-009).
9. Keyboard: Tab into the tab bar, then use Up/Down arrows. **Expected**: focus moves
   between tabs and selection follows (FR-016).

## Manual scenario 3 — Secondary features behind one menu (US3, FR-011)

1. Open the `⋮` overflow menu. **Expected**: Profile settings, Import profile, Export
   profile, Cloud backup are all there and each opens its existing dialog, fully
   functional.
2. Visual pass: one accent color, functional icons only, no decorative elements (FR-013).

## Cross-browser verification (Constitution II)

Repeat scenarios 1–3 on Firefox:

```bash
npm run dev:firefox   # load .output/firefox-mv3
```

Pay special attention to drag-and-drop reordering and keyboard navigation, the two most
browser-sensitive interactions.

## Expected overall outcome

All automated suites pass on a clean checkout, both browsers behave identically, and the
success criteria in [spec.md](spec.md) (SC-001..SC-006) are demonstrable in the running
popup.
