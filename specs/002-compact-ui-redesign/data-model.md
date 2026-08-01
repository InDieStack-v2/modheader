# Data Model: Compact Profile-Tab UI Redesign

**Date**: 2026-08-01 | **Feature**: `002-compact-ui-redesign`

**No storage schema changes.** FR-015 requires profiles, rules, and settings to be stored
exactly as today. The persisted entities below are unchanged from feature 001; they are
restated only where the redesign touches their semantics. The only new data is
*ephemeral* popup-local UI state.

## Persisted Entities (unchanged)

### Profile (`lib/types.ts`)

| Field | Type | Notes for this feature |
|-------|------|------------------------|
| `title` | string | Free text; **duplicates allowed** (Clarifications 2026-08-01). Displayed as the tab label; truncated visually when long, full name on hover. |
| `headers` | HeaderRule[] | Shown in the compact workspace, unchanged editing semantics. |
| `respHeaders` | HeaderRule[] | Same as above. |
| `filters` | Filter[] | Edited via existing FilterEditor in compact form. |
| `appendMode` | AppendMode | Edited via SettingsDialog (overflow menu), unchanged. |
| `hideComment` | boolean? | Edited via SettingsDialog, unchanged. |

**Validation rules**: none added. Rename performs no uniqueness check.

### RuntimeState (`chrome.storage.local`, unchanged)

| Key | Type | Notes for this feature |
|-----|------|------------------------|
| `profiles` | Profile[] | Tab order **is** array order: drag-reorder rewrites the array via `setProfiles` (FR-007). |
| `selectedProfileIndex` | number | Already persists the last active profile → satisfies FR-008 with no schema change. Always points at a valid profile (FR-010). |
| `isPaused` | boolean? | Surfaced as a compact status indicator (FR-012), same values. |
| `lockedTabId` | number? | Same as above. |

### State transitions (Profile lifecycle)

- **Create** → appended at end of `profiles`, becomes `selectedProfileIndex` (US2 scenario 2).
- **Select** → `selectedProfileIndex` updated; viewed profile is the applied profile (existing save-on-change flow recompiles DNR rules — unchanged).
- **Rename** → `title` updated in place; in-progress edits in the workspace are already committed (save-on-change), so tab switches never lose data (Clarifications).
- **Duplicate** → clone appended at end and selected (existing `cloneProfile` behavior).
- **Reorder** → element moved from index `from` to `to` (`reorderProfiles` helper); `selectedProfileIndex` follows the active profile to its new index.
- **Delete** → removed from array; nearest remaining profile becomes active; blocked when `profiles.length === 1` (FR-010). Restorable via undo within the snackbar window (FR-017).

## Ephemeral UI State (popup-local React state, not persisted)

| State | Type | Lifetime |
|-------|------|----------|
| `undoBuffer` | `{ profile: Profile; index: number } \| null` | From delete until Undo pressed or snackbar auto-hide (~5s) or popup close. |
| `renamingIndex` | `number \| null` | While a tab is in inline-rename mode. |
| `dragIndex` | `number \| null` | During an in-flight tab drag. |

Rationale for ephemerality: the popup reloads from storage on every open, and FR-017
specifies only a "few seconds" undo window — persisting undo state would violate FR-015
for no user-visible benefit (research R4).

## New Pure Logic (unit-tested per Constitution V)

`lib/profiles.ts`:

```text
reorderProfiles(profiles: Profile[], from: number, to: number): Profile[]
```

- Returns a new array with the element at `from` moved to `to`; input not mutated.
- `from`/`to` clamped to valid indices; `from === to` returns an equivalent copy.
- Used by the tab bar's drop handler; the caller recomputes `selectedProfileIndex` so the
  active profile stays active after the move.
