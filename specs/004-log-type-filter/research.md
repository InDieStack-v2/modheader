# Research: Request Log Type Filter and Row Redesign

**Date**: 2026-08-17 | **Feature**: `004-log-type-filter`

## D1 — Shared type catalog

**Decision**: Move the FilterEditor `RESOURCE_TYPES` list into `lib/resource-types.ts` as `STANDARD_RESOURCE_TYPES: { value, label, shortLabel }[]` (`main_frame`, `sub_frame`, `stylesheet`, `script`, `image`, `object`, `xmlhttprequest`, `other`). `normalizeResourceType(type)` maps unknown values to `other`.

**Rationale**: Spec requires the same names on Logs and Headers. One catalog avoids drift.

**Alternatives considered**: Duplicate labels in two components — rejected (FR-015).

## D2 — View-filter storage

**Decision**: Session key `requestLogTypeFilter: string[][]` parallel to profiles. `[]` or missing slot = all types (Logs). Remap/drop/insert with the existing session-log index helpers. Reset slot to `[]` in `clearEntries`. Browser restart clears session (FR-005).

**Rationale**: Same lifetime as recording/logs. Does not touch `Profile` documents (FR-011).

**Alternatives considered**: React-only state — lost on popup close, violates FR-005. Store on Profile — violates FR-011 / export.

## D3 — Always-visible toggles

**Decision**: MUI small wrap toggles/chips. Logs: explicit **All** + one toggle per standard type. `[]` storage ↔ All selected. Capture: type toggles only, no All. No menu, no Select.

**Rationale**: Clarification: always-visible toggles. Chips wrap in 720px without page-level horizontal scroll.

**Alternatives considered**: Multi `Select` (current Headers UX) — hides selection. Popover picker — rejected in clarify.

## D4 — Toggle reducer

**Decision**: `toggleType(selected: string[], value: string, opts: { mode: 'logs' | 'capture' }): string[]`

- Logs: clicking a type when selected is `[]` (all) → result `[value]` (show only that type). Clicking to remove the last remaining type → `[]` (all).
- Capture: cannot remove the last type; click is ignored (or no-op) if `selected.length === 1` and value is that type.

**Rationale**: Spec empty-selection semantics differ between Logs and Headers.

## D5 — Collapsed row layout

**Decision**: Single horizontal flex row: method (fixed min-width, monospace), status (color: pending=warning, 2xx=success, 4xx/5xx/failed=error), short type label, URL (`flex:1`, `noWrap`, `title={fullUrl}`), copy-cURL icon. Click row body to expand. Time can sit as a quiet caption on the far left or omit if width is tight — prefer a short time (`HH:MM:SS`) before method.

**Rationale**: FR-006/007/008/010. One line, separate fields, no popup horizontal scroll.

**Alternatives considered**: Keep two-line dump — rejected by US2.

## D6 — Filter vs capture

**Decision**: `visibleEntries(entries, selectedTypes)` is a pure list filter. Observer and `appendOrUpdateEntry` unchanged.

**Rationale**: FR-003 / SC-005.
