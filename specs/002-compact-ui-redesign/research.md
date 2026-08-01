# Research: Compact Profile-Tab UI Redesign

**Date**: 2026-08-01 | **Feature**: `002-compact-ui-redesign`

The Technical Context had no NEEDS CLARIFICATION unknowns (the stack is fixed by the
constitution and feature 001). The research below resolves the open *design* choices for
the redesign within the existing stack.

## R1: Drag-and-drop reordering without a new dependency

- **Decision**: Implement tab reordering with native HTML5 drag events
  (`draggable`, `onDragStart`, `onDragOver`, `onDrop`) directly on tab elements, calling a
  pure `reorderProfiles(profiles, from, to)` helper in `lib/profiles.ts`.
- **Rationale**: Constitution III/IV forbid new dependencies for marginal benefit. The tab
  bar is a single-axis vertical list — the simplest DnD case — which native events handle
  adequately in both Chrome and Firefox popup documents. A library (dnd-kit,
  react-beautiful-dnd) would add bundle size and maintenance for no functional gain at
  this scale.
- **Alternatives considered**: dnd-kit (rejected: new dependency, overkill for one
  vertical list); MUI-native DnD (does not exist); pointer-event custom DnD (rejected:
  more code than HTML5 events for the same result).

## R2: Tab bar component base (MUI Tabs vs. custom list)

- **Decision**: Build `ProfileTabBar` on MUI `Tabs` with `orientation="vertical"` and one
  `Tab` per profile, styled for compact density.
- **Rationale**: MUI `Tabs` provides roving-tabindex keyboard navigation (arrow keys move
  between tabs) and correct `role="tablist"` semantics out of the box, which satisfies
  FR-016 (basic keyboard navigation) with almost no custom code. Tabs also gives a
  built-in active-indicator visual for FR-006. HTML5 `draggable` can be attached to the
  tab elements without conflicting with MUI's keyboard handling.
- **Alternatives considered**: Custom `Box`/`List`-based tablist (rejected: must
  reimplement focus management and ARIA semantics by hand — more code, worse a11y);
  keeping the drawer pattern (rejected: violates the spec's always-visible tab bar).

## R3: Rename interaction on tabs

- **Decision**: Rename via the tab's context menu ("Rename") and double-click on the tab
  label; both swap the label for an inline `TextField` that commits on blur/Enter and
  cancels on Escape. Duplicate names are allowed (Clarifications, 2026-08-01) — no
  validation.
- **Rationale**: Inline editing keeps the UI dialog-free (minimalist) and matches the
  spec's "rename directly from the tab bar" (FR-007). Double-click is the conventional
  rename gesture for tabs/labels; the context menu keeps it discoverable.
- **Alternatives considered**: Keep rename only in the toolbar profile-name field
  (rejected: FR-007 requires tab-bar-native management); rename dialog (rejected: modal
  friction against the minimalist goal).

## R4: Delete-with-undo mechanics

- **Decision**: On delete, remove the profile via the existing `saveProfiles` flow and
  open a MUI `Snackbar` ("Profile deleted") with an Undo action for ~5 seconds. The
  deleted profile and its original index are held in popup-local React state only; Undo
  re-inserts it at the same index and re-selects it. Deleting the last remaining profile
  is blocked (tab context menu disables Delete when `profiles.length === 1`, FR-010).
- **Rationale**: Matches the clarification decision (delete immediately + undo snackbar).
  Because the popup is ephemeral (state reloads from storage on open), the undo buffer
  does not need to survive popup close — a delete followed by popup close is simply
  permanent, consistent with the "few seconds" window in FR-017.
- **Alternatives considered**: Confirmation dialog (rejected by user clarification);
  persisting a trash list in storage (rejected: schema change violates FR-015 and adds
  complexity for no user-visible benefit).

## R5: Compact density approach

- **Decision**: Achieve compactness through layout and per-component density
  (`size="small"`, reduced paddings/margins, `dense` lists, smaller typography scale in
  the existing MUI theme in `main.tsx`) rather than introducing a separate "density"
  system. Secondary actions (Profile settings, Import/Export, Cloud backup) move into the
  existing `⋮` overflow menu; the AppBar loses the drawer toggle, gains the tab-lock and
  pause controls as icon buttons, and the rotating-tip/donate prompts are removed
  (FR-013). Paused / tab-lock status becomes a compact inline indicator (small
  icon + text chip) instead of full-width `Alert` banners, per FR-012.
- **Rationale**: SC-003 (≥5 rows visible) and SC-005 (half the top-level chrome) are met
  by removing the AppBar-heavy layout and banner stack, not by shrinking everything
  uniformly. Keeping changes to standard MUI density props avoids a custom design system
  (Constitution III).
- **Alternatives considered**: A user-selectable density setting (rejected: compact-only
  was decided in clarification; a toggle would violate FR-014); CSS-only overhaul with
  custom theme variants (rejected: more surface area than targeted density props).

## R6: Existing test impact

- **Decision**: Add `tests/e2e/tabbar.spec.ts` for the new flows and update
  `tests/e2e/parity.spec.ts` (and any other e2e specs that open the drawer or click the
  ☰ "Profile menu" button) to drive the tab bar instead. Unit coverage stays in
  `tests/unit/profiles.test.ts` with added `reorderProfiles` cases.
- **Rationale**: Constitution V requires major user flows to have e2e coverage; the
  profile-switch flow's UI entry point changes, so existing selectors must follow.
- **Alternatives considered**: Rewriting all e2e specs (rejected: only drawer/profile
  flows are affected; header-editing specs like `headers.spec.ts` are layout-agnostic).
