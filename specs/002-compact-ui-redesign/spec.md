# Feature Specification: Compact Profile-Tab UI Redesign

**Feature Branch**: `002-compact-ui-redesign`

**Created**: 2026-08-01

**Status**: Draft

**Input**: User description: "I want to re-design UI to make compact mode by default. each profile wil be in left tab bar (one active at time). I prefer minimalist design style"

## Clarifications

### Session 2026-08-01

- Q: When a profile tab switch happens while an edit is in progress, what should happen to that edit? → A: Commit automatically — edits save immediately as typed; switching tabs persists and moves on, with no prompt.
- Q: Should two profiles be allowed to have the same name, or must profile names be unique? → A: Duplicates allowed — names are free text; profiles are distinguished by identity and tab order, not name, with no rename validation.
- Q: How should users reorder profile tabs in the left tab bar? → A: Drag-and-drop only — tabs reorder by dragging, with no extra move up/down controls.
- Q: Should the new compact popup support keyboard navigation in this release? → A: Yes, basic keyboard support — standard focus order plus arrow-key navigation between profile tabs.
- Q: When a user deletes a profile from the tab bar, should deletion require a confirmation step, or happen immediately? → A: Delete immediately with an undo snackbar — no confirmation dialog; a temporary snackbar offers Undo for a few seconds.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Compact Editing Workspace by Default (Priority: P1)

When the user opens the extension popup, they immediately see a compact, minimalist workspace focused on the header rules of the currently active profile. Unnecessary visual chrome (large toolbars, verbose labels, decorative elements) is removed so that the maximum share of the limited popup area is dedicated to the actual header table and its controls.

**Why this priority**: The popup is the primary interaction surface of the extension; users open it many times per day. A compact default layout directly improves every session and is the core ask of this feature.

**Independent Test**: Open the popup with an existing profile containing header rules and verify that the header editing area occupies the majority of the popup, all primary actions (add row, toggle, pause) are reachable without scrolling, and the interface renders at the standard popup size without clipping.

**Acceptance Scenarios**:

1. **Given** the user has at least one profile, **When** they open the popup, **Then** the interface opens in compact mode showing the active profile's header rules without any extra step.
2. **Given** the popup is open in compact mode, **When** the user adds, edits, reorders, or deletes a header rule, **Then** all these actions remain fully functional within the compact layout.
3. **Given** a fresh install with no profiles, **When** the user opens the popup, **Then** a default profile exists, is shown as active, and the compact workspace is ready for editing.

---

### User Story 2 - Profile Switching via Left Tab Bar (Priority: P2)

The user's profiles are displayed as a vertical tab bar along the left edge of the popup. Exactly one profile is active at any time; clicking a tab makes that profile active and immediately displays its header rules in the workspace. Profile management actions (add, rename, delete, duplicate, reorder) are available directly from the tab bar without navigating to a separate profile list view.

**Why this priority**: Profile switching is the second most frequent action after editing rules. Replacing the current separate profile-list panel with an always-visible tab bar removes a navigation step and makes the active profile constantly visible.

**Independent Test**: Create three profiles, switch between them using the tab bar, and verify that each switch instantly shows the correct profile's rules and that the active tab is clearly indicated; add, rename, and delete profiles from the tab bar and verify the tab bar updates accordingly.

**Acceptance Scenarios**:

1. **Given** multiple profiles exist, **When** the user clicks a different profile tab, **Then** that profile becomes active, its tab is visually highlighted, and its header rules replace the previous content in the workspace.
2. **Given** a profile is active, **When** the user creates a new profile from the tab bar, **Then** a new tab appears and the new profile becomes the active one.
3. **Given** a profile is active, **When** the user deletes it, **Then** its tab is removed and another profile (the nearest remaining one) becomes active automatically.
4. **Given** the popup is closed and reopened, **When** it reopens, **Then** the most recently active profile is shown as active.
5. **Given** more profiles exist than fit in the visible tab bar height, **When** the user scrolls the tab bar, **Then** all profile tabs remain reachable without affecting the workspace area.

---

### User Story 3 - Minimalist Visual Style (Priority: P3)

The entire popup adopts a minimalist visual style: restrained use of color and iconography, generous whitespace within the compact constraints, consistent alignment, and no decorative elements that do not serve a function. Secondary features (settings, import/export, cloud backup, tips) are tucked into unobtrusive entry points rather than competing for attention.

**Why this priority**: The user explicitly prefers a minimalist aesthetic; it reinforces the compact goal by reducing visual noise, but it is separable from the layout changes and can be evaluated on its own.

**Independent Test**: Review the popup visually against a minimalism checklist (single accent color, no unused decoration, secondary actions hidden behind a menu) and confirm every remaining element maps to a functional requirement.

**Acceptance Scenarios**:

1. **Given** the popup is open, **When** the user looks for secondary actions (settings, import/export, cloud backup), **Then** they are all reachable from a single, clearly identifiable overflow/menu control.
2. **Given** the popup is open, **When** the user scans the interface, **Then** no purely decorative element (banners, tip carousels, promotional links in the main view) is present in the default compact view.

---

### Edge Cases

- What happens when there is exactly one profile? The tab bar shows a single tab; deletion of the last remaining profile is prevented so an active profile always exists.
- What happens with very long profile names? Tab labels truncate gracefully (with the full name available on hover) without breaking the tab bar's fixed width.
- What happens when there are dozens of profiles? The tab bar becomes scrollable while keeping its width and the workspace layout stable.
- What happens on narrow or small popup windows? The compact layout remains usable down to the minimum popup dimensions supported by the browser; no horizontal scrolling of the workspace.
- What happens to paused state and tab-lock indicators in compact mode? Global state (paused, tab lock) remains visible through minimal status indicators, not removed.
- What happens when a profile switch occurs while an edit is in progress? The edit is committed automatically (edits save as typed), so switching tabs never loses data and never prompts.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The popup MUST open in compact mode by default for all users, with no setup step required.
- **FR-002**: The compact layout MUST dedicate the majority of the popup area to the active profile's header rules workspace.
- **FR-003**: All existing header-editing capabilities (add, edit, delete, enable/disable, sort, filter) MUST remain fully available in compact mode.
- **FR-004**: Profiles MUST be presented as a vertical tab bar anchored to the left edge of the popup, with one tab per profile.
- **FR-005**: Exactly one profile MUST be active at any time; selecting a tab MUST immediately make that profile active and display its rules.
- **FR-006**: The active profile tab MUST be visually distinguishable from inactive tabs at a glance.
- **FR-007**: Users MUST be able to create, rename, delete, and duplicate profiles directly from the tab bar without leaving the main view; reordering MUST be done by dragging tabs (drag-and-drop only, no move up/down controls).
- **FR-008**: The last active profile MUST be remembered and restored when the popup is reopened.
- **FR-009**: When the number of profiles exceeds the visible tab bar space, the tab bar MUST allow access to all profiles (e.g., scrolling) without altering the workspace layout.
- **FR-010**: An active profile MUST always exist; deletion of the final remaining profile MUST be prevented (the Delete action is disabled when only one profile remains).
- **FR-011**: Secondary features (settings, import/export, cloud backup) MUST be accessible from a single consolidated menu entry point in the compact view.
- **FR-012**: Global status that affects behavior (e.g., paused state, tab lock) MUST remain visible via minimal indicators in the compact layout.
- **FR-013**: The visual style MUST follow a minimalist approach: one accent color, functional icons only, and no decorative content (such as rotating tips or promotional links) in the default view.
- **FR-014**: Compact MUST be the only layout; the previous non-compact/expanded layout is removed entirely, with no toggle to switch back.
- **FR-015**: The redesign MUST work identically in both supported browsers (Chrome and Firefox) and MUST NOT change how profiles, rules, or settings are stored.
- **FR-016**: The popup MUST support basic keyboard navigation: a standard focus order across the tab bar and workspace controls, plus arrow-key navigation between profile tabs.
- **FR-017**: Profile deletion MUST NOT use a confirmation dialog; instead, the profile is removed immediately and a temporary snackbar MUST offer an Undo action that fully restores the deleted profile (rules and settings) for a few seconds.

### Key Entities *(include if feature involves data)*

- **Profile**: A named set of header rules and associated settings; displayed as one tab in the left tab bar; exactly one is active at a time. Names are free text — duplicates are allowed; profiles are distinguished by identity and tab order, not by name.
- **Header Rule**: A row in the workspace belonging to a profile (name, value, enabled state, optional comment/filter); the primary content of the compact view.
- **UI Preference**: The user's layout-related choices (e.g., last active profile); persisted across popup sessions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can switch between any two profiles in at most 1 click, compared to the multi-step profile panel navigation today.
- **SC-002**: The active profile and its header rules are visible within 1 second of opening the popup, with no interaction required.
- **SC-003**: At the standard popup size, at least 5 header rule rows are visible without scrolling in compact mode.
- **SC-004**: 100% of existing header-editing and profile-management actions remain reachable within the new layout (no feature regression).
- **SC-005**: Persistent top-level chrome elements competing with the workspace drop from the current 4 (AppBar toolbar, profile drawer, paused/tab-lock banner stack, rotating-tip snackbar) to at most 2 (compact toolbar, status indicator row).
- **SC-006**: All popup interactions complete without horizontal scrolling at the minimum supported popup width in both supported browsers.

## Assumptions

- The redesign applies to the extension popup only; background behavior, rule compilation, and data storage are unchanged.
- Existing user data (profiles, rules, settings) carries over unchanged; no data migration is required for this feature.
- "Compact mode by default" means every user (existing and new) sees the compact layout on next popup open after the update, with no opt-in step.
- Profile reordering in the tab bar follows the existing profile ordering semantics (order is meaningful and persisted).
- The standard browser popup dimensions (roughly 800x600 px maximum) bound the layout; mobile browsers are out of scope.
- Rotating tips and donation prompts currently shown in the popup are removed from the default compact view; if retained at all, they move behind the secondary menu.
