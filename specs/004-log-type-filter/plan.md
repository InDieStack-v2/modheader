# Implementation Plan: Request Log Type Filter and Row Redesign

**Branch**: `004-log-type-filter` | **Date**: 2026-08-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/004-log-type-filter/spec.md`

## Summary

Add an always-visible resource-type toggle row on the Logs tab (full standard list; multi-select; empty selection = all types). Remember the selection per profile in `storage.session`. Redesign collapsed log rows into one compact line (method, status, type, truncated URL, copy cURL). Reuse the same toggle control on the Headers capture filter, replacing the current multi `Select` (must keep at least one type there). Capture, storage of log entries, and 003 observer behavior stay unchanged.

## Technical Context

**Language/Version**: TypeScript ~5.9.3 (strict), React 19.2

**Primary Dependencies**: Existing WXT + MUI 9. No new packages.

**Storage**: Session key `requestLogTypeFilter` (parallel to profile index). Profile documents unchanged. Capture log entries unchanged.

**Testing**: Vitest for `visibleEntries` / type normalize / toggle reducer. Playwright: Logs filter, row fields, Headers capture toggles.

**Target Platform**: Chrome + Firefox MV3 popup

**Project Type**: browser-extension (popup UI increment)

**Performance Goals**: Filter applies instantly on toggle (SC-001 ≤ 2 clicks to XHR-only). List stays within compact width (FR-009).

**Constraints**: No new permissions. Compact 720px popup; eight toggles wrap, no horizontal page scroll. Constitution III — extract one shared toggle component, no extra state library.

**Scale/Scope**: 1 shared component, FilterEditor + RequestLogList updates, session-log slot for filter arrays, e2e additions.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Modern Build Toolchain | Same WXT build | ✅ PASS |
| II. Cross-Browser Compatibility | MUI chips/toggles work on both browsers | ✅ PASS |
| III. Simplicity & Minimal Change | UI + one session key; no observer changes | ✅ PASS |
| IV. Managed Dependencies | No new packages | ✅ PASS |
| V. Test Discipline | Unit for filter helper; e2e for Logs + Headers toggles | ✅ PASS |

**Gate result**: PROCEED.

**Post-Phase-1 re-check**: No new permissions, no profile-schema change, session filter resets with log/restart. No violations.

## Project Structure

### Documentation (this feature)

```text
specs/004-log-type-filter/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/ui-components.md
└── tasks.md
```

### Source Code (repository root)

```text
lib/
├── resource-types.ts        # NEW: STANDARD_RESOURCE_TYPES + normalize + visibleEntries
└── session-log.ts           # + type filter get/set/remap/insert/drop/clear

components/
├── ResourceTypeToggles.tsx  # NEW: always-visible multi-select
├── FilterEditor.tsx         # replace types Select
├── RequestLogList.tsx       # filter row + redesigned collapsed row
└── RequestLogDetail.tsx     # unchanged except full URL already there

tests/unit/resource-types.test.ts
tests/e2e/request-log.spec.ts   # extend
tests/e2e/headers or new filter e2e for Headers toggles
```

**Structure Decision**: Stay in the existing WXT popup layout. Shared toggle component keeps Logs and Headers in sync (FR-015).

## Complexity Tracking

> No constitution violations.
