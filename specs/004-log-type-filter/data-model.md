# Data Model: Request Log Type Filter

**Date**: 2026-08-17 | **Feature**: `004-log-type-filter`

Profile / RequestLogEntry documents are unchanged (feature 003).

## RequestLogState (session) — additions

| Key | Type | Notes |
|-----|------|-------|
| `requestLogTypeFilter` | `string[][]` | Parallel to `profiles[]`. Each slot is the set of visible type values. `[]` = all types. |

Existing keys `requestLogRecording` and `requestLogEntries` unchanged.

## Validation

- Values MUST be from `STANDARD_RESOURCE_TYPES` (or ignored).
- Requests: `[]` means all types visible.
- Headers capture `TypeFilter.resourceType`: length ≥ 1; last type cannot be removed.
- `remapOnReorder` / `dropAt` / `insertSlot` / `ensureSlots` MUST move this array with recording and entries.
- `clearEntries(i)` also sets `requestLogTypeFilter[i] = []`.
- Unknown `entry.resourceType` compares as `other` for visibility.

## State transitions

```text
default / clear / restart → [] (all visible)
toggle on when []         → [that type]   (Requests)
toggle off last Requests type → []
toggle off last capture   → no-op
```
