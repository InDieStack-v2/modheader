# Implementation Plan: Modernize ModHeader (MV3 + React/TypeScript Rewrite)

**Branch**: `001-modernize-react-migration` | **Date**: 2026-07-31 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-modernize-react-migration/spec.md`

## Summary

Rewrite ModHeader as a Manifest V3 extension: replace the blocking-webRequest background
page with declarativeNetRequest session rules compiled from profiles, replace the
AngularJS popup with a React + TypeScript UI (WXT + MUI), migrate user data from
`localStorage` to `chrome.storage.local`, fix cloud-backup sync quota failures via
chunked snapshots, and add a full unit + E2E test suite. All 13 existing features are
preserved with documented graceful degradation where DNR cannot match MV2 behavior.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode)

**Primary Dependencies**: WXT (MV3 extension framework, dual-browser builds), React 19,
MUI v7 (closest visual parity to Angular Material), webextension-polyfill (via WXT)

**Storage**: `chrome.storage.local` (profiles, runtime state), `chrome.storage.sync`
(cloud backup, chunked); legacy `localStorage` read once for migration only

**Testing**: Vitest (unit), Playwright (E2E, both browsers per WXT testing docs)

**Target Platform**: Chrome MV3 (current stable), Firefox MV3 (event-page background,
≥ FF 113 for DNR modifyHeaders)

**Project Type**: browser-extension (popup UI + background worker, no backend)

**Performance Goals**: Popup interactive < 300ms on open; DNR rule recompile + apply
< 500ms after profile save; zero per-request JS execution (rules are declarative)

**Constraints**: No blocking webRequest (Chrome MV3); DNR session-rule limit
(≥ 5,000 guaranteed); sync storage quotas (8 KB/item, 100 KB total); service worker /
event page can be killed at any time — no in-memory-only state

**Scale/Scope**: ~1,500 LOC rewritten; 13 user-facing features; 4 storage entities;
2 browser targets

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Zero-Build Development | ❌ VIOLATED (justified) | React+TS requires a build step. The owner mandated the rewrite; constitution amendment to v2.0.0 is a planned task. |
| II. Cross-Browser Compatibility | ✅ PASS | Single DNR mechanism on both browsers (Clarification Q1); WXT emits both targets. |
| III. Simplicity & Minimal Change (YAGNI) | ✅ PASS | Scope locked to parity + mandated fixes; WXT chosen over a hand-rolled webpack setup as the simpler dual-browser path. |
| IV. Vendored Dependencies Only | ❌ VIOLATED (justified) | npm-managed deps replace vendored libs; covered by the same constitution amendment. |
| V. Manual Verification Discipline | ❌ VIOLATED (justified) | Owner chose full automated suite (Clarification Q2); amendment planned. |

**Gate result**: PROCEED — all three violations carry owner mandate + spec Assumptions,
and are tracked in Complexity Tracking below. Constitution amendment is a required
follow-up task, not optional.

**Post-Phase-1 re-check**: design artifacts introduce no new violations. Principle II
holds (single DNR mechanism, WXT dual-target builds). Principle III holds (no state
library, session rules over dynamic, no backend). Amendments to Principles I/IV/V remain
scheduled for the implementation phase (constitution v2.0.0).

## Project Structure

### Documentation (this feature)

```text
specs/001-modernize-react-migration/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (data format contracts)
└── tasks.md             # Phase 2 output (/skill:speckit-tasks)
```

### Source Code (repository root)

The extension moves from `src/` (plain JS) to a WXT project layout. The legacy `src/`
directory is kept until parity is verified, then removed.

```text
entrypoints/
├── background.ts            # MV3 service worker: DNR rule compiler, tabs/badge/context
│                            #   menus, cloud backup, localStorage migration trigger
├── migration/
│   ├── index.html           # hidden migration page shell (offscreen doc / fallback tab)
│   └── main.ts              # runs lib/migration.ts, signals completion to background
└── popup/
    ├── index.html           # popup shell
    ├── main.tsx             # React entry
    └── App.tsx              # root component (profile UI)

components/                  # React components (profile list, header table, filters,
                             #   dialogs: import/export/settings/cloud backup, toast)
lib/
├── storage.ts               # typed chrome.storage.local access + localStorage migration
├── profiles.ts              # profile model ops (create/clone/sort/fix legacy patterns)
├── dnr.ts                   # profile -> DNR session rules compiler (+ unsupported-header
│                            #   detection for graceful degradation)
├── backup.ts                # chunked chrome.storage.sync cloud backup/restore
└── constants.ts             # shared constants (header lists, quota sizes, rule limits)

assets/                      # icons, css
tests/
├── unit/                    # Vitest: profiles, dnr compiler, backup chunking, migration
└── e2e/                     # Playwright: header modification, parity flows, migration

wxt.config.ts                # WXT config (manifest per browser target)
package.json                 # replaces current tooling (build/lint unified under WXT)
```

**Structure Decision**: WXT conventional layout (`entrypoints/`, `components/`, `lib/`,
`tests/`). Rationale: WXT generates both Chrome and Firefox MV3 manifests and bundles
from this layout with zero extra configuration — the simplest path to the dual-browser
requirement. The existing `scripts/build.mjs` + `eslint.config.mjs` are superseded by
WXT's `zip` + ESLint integration and will be removed in cleanup.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Build toolchain (WXT + Vite) violates Principle I | React+TS cannot run unbundled; owner mandated React+TS | Keeping zero-build plain JS contradicts the explicit feature request |
| npm dependencies violate Principle IV | React/MUI/WXT are not sanely vendorable as flat files | Vendoring a React tree defeats the maintainability goal of the rewrite |
| Automated tests violate Principle V | Owner chose full suite (Clarification Q2) to protect migration + parity | Manual-only verification cannot guard 13 features × 2 browsers against regressions |
| WXT framework dependency | Native dual-browser MV3 manifests, dev HMR, zip output, Playwright docs | Raw Vite+CRXJS has weak Firefox MV3 support; hand-rolled config = more code to own |
