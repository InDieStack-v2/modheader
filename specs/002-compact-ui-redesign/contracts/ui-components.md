# UI Contracts: Compact Profile-Tab UI Redesign

**Date**: 2026-08-01 | **Feature**: `002-compact-ui-redesign`

The extension exposes no network/API surface; its "contracts" are the popup component
interfaces. These are the props contracts the implementation must honor so that
`App.tsx` and tests can rely on them.

## ProfileTabBar (NEW — `components/ProfileTabBar.tsx`)

Vertical profile tab bar replacing `ProfileList`. One tab per profile, exactly one
selected. Built on MUI `Tabs orientation="vertical"` (research R2).

```ts
export interface ProfileTabBarProps {
  profiles: Profile[];
  /** Index of the active profile; always valid (FR-005, FR-010). */
  selectedIndex: number;
  /** Select a tab → active profile changes immediately. */
  onSelect: (index: number) => void;
  /** Append a new profile; caller selects it. */
  onCreate: () => void;
  /** Duplicate the profile at index; caller selects the clone. */
  onDuplicate: (index: number) => void;
  /** Commit an inline rename; duplicate titles allowed, no validation. */
  onRename: (index: number, title: string) => void;
  /**
   * Delete the profile at index. Guaranteed never called for the last
   * remaining profile — the component disables Delete when
   * profiles.length === 1 (FR-010). Undo is the caller's concern (FR-017).
   */
  onDelete: (index: number) => void;
  /** Drag-reorder: move profile from → to (FR-007, drag-and-drop only). */
  onReorder: (from: number, to: number) => void;
}
```

Behavioral contract:

- The selected tab is visually distinct via the MUI Tabs indicator plus a selected
  background (FR-006).
- Long titles truncate with ellipsis; the full title is available via the tab's
  `title` tooltip (edge case).
- When tabs exceed the visible height, the tab list scrolls internally; the bar's width
  and the workspace layout do not change (FR-009).
- Rename is triggered by double-click on the tab label or a "Rename" context-menu item;
  an inline text field commits on Enter/blur and cancels on Escape (research R3).
- Each tab exposes a context menu (right-click and a per-tab "more" affordance):
  Rename, Duplicate, Delete (Delete disabled for the last profile).
- Keyboard: MUI roving tabindex — Up/Down arrows move between tabs; focus/selection
  follows MUI Tabs defaults (FR-016).
- Drag-and-drop: tabs carry HTML5 `draggable`; drop targets are other tabs; a drop calls
  `onReorder(from, to)` (research R1). No other reorder controls exist.
- A "+ New profile" control sits at the bottom of the tab list and calls `onCreate`.

## App (REBUILT — `entrypoints/popup/App.tsx`)

Layout contract (what renders where):

```text
┌──────────────────────────────────────────────┐
│ [TabBar]  │ compact toolbar: pause ▶/❚❚ · tab lock · ⋮ menu │
│ profiles  ├──────────────────────────────────┤
│ (vertical)│ status indicators (paused / tab lock),   │
│           │ unsupported-header notices (compact)     │
│  + New    ├──────────────────────────────────┤
│           │ FilterEditor (compact)                 │
│           │ HeaderTable "Request Headers"          │
│           │ HeaderTable "Response Headers"         │
└──────────────────────────────────────────────┘
```

- **Toolbar** (replaces the AppBar): pause/play and tab-lock toggle as icon buttons, plus
  the existing `⋮` overflow menu. The profile-name TextField and ☰ drawer toggle are
  removed (rename now lives on tabs). (Increment note: the ☰ drawer toggle survives in
  the compact toolbar only until the tab bar is wired — see tasks.md T005/T011.)
- **Overflow menu** items: Profile settings, Import profile, Export profile, Cloud
  backup. (Delete/Clone move to the tab bar; FR-011.)
- **Status indicators**: paused / tab-lock shown as compact inline chips with a one-click
  undo action (FR-012) instead of full-width `Alert` banners. Unsupported-header notices
  remain visible but in compact form.
- **Undo delete**: App holds the `undoBuffer` (see data-model.md) and renders a MUI
  `Snackbar` with an Undo action (~5s auto-hide); Undo re-inserts the profile at its
  original index and re-selects it (FR-017).
- **Removed from default view**: rotating tips, donate/review prompts, `ProfileList`
  drawer (FR-013, FR-014). `components/ProfileList.tsx` is deleted.

## Callback contract with storage (unchanged)

All mutations continue through the existing `saveProfiles(profiles, selectedIndex?)` /
`saveProfile(updated)` helpers in `App.tsx`, which write straight to
`chrome.storage.local` so the background worker recompiles DNR rules immediately
(save-on-change, T021 of feature 001). Tab selection persists via
`setRuntimeState({ selectedProfileIndex })` — this satisfies FR-008 with no new
persistence code.

## Dialogs (unchanged contracts)

`SettingsDialog`, `ImportExportDialog`, `CloudBackupDialog` keep their existing props;
only their trigger moves (overflow menu instead of drawer/menu items).
