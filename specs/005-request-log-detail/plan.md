# Implementation Plan: Expandable Request Log Detail

**Branch**: `005-request-log-detail` | **Date**: 2026-08-18 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/005-request-log-detail/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Make request-log **detail actually contain bodies**, then make the row/detail usable.

Capture today often stores `empty` / `unavailable` for page XHR/fetch: the MAIN-world hook is not injected into already-open tabs, hook messages arrive after the row leaves `pending` and are dropped, and the hook never posts the outbound payload. Fix those three paths (inject on Start, attach to completed rows, serialize request bodies from `fetch`/`XHR`) without new permissions.

UI: keep one-at-a-time in-place expand; restyle `RequestLogDetail` into Overview + Request + Response; pretty-print JSON for display only; copy stored body text from each panel. Recording, type filter, profile documents, and cURL stay as in 003/004.

## Technical Context

**Language/Version**: TypeScript ~5.9.3 (strict), React 19.2

**Primary Dependencies**: WXT 0.21, MUI 9.2, `wxt/browser` — no new runtime packages

**Storage**: Existing `storage.session` log entries. No new keys. Expand id is popup React state only.

**Testing**: Vitest (`pickEntryForBody`, `formatBodyForDisplay`, body merge). Playwright e2e: already-open tab + `fetch` POST, expand, both bodies visible, copy body, cURL does not expand.

**Target Platform**: Chrome MV3 and Firefox MV3

**Project Type**: browser-extension (popup + background observer + page hook)

**Performance Goals**: Bodies attached and visible in the open detail within the existing 2s live-update budget (SC-002 / SC-009). Inject-all-tabs on Start must not freeze the popup (fire-and-forget per tab, errors swallowed).

**Constraints**: No `debugger`, no `webRequestBlocking`, no new permissions, no new npm deps. 64 KB / 200-entry / 8 MB caps unchanged. Restricted pages may fail inject. Service-worker response bodies remain optional.

**Scale/Scope**: Touch hook JS, observer/match helpers, `RequestLogDetail` (+ small list/App expand reset), one new `lib/body-format.ts`. No profile-schema change.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Modern Build Toolchain | Same WXT/Vite build; hook files stay bundled/static in `public/` | ✅ PASS |
| II. Cross-Browser Compatibility | `executeScript` + MAIN world on Chrome and modern Firefox; feature-detect/catch inject failures | ✅ PASS |
| III. Simplicity & Minimal Change (YAGNI) | No debugger API, no new deps, no schema change; reuse `preferBody` / expand state | ✅ PASS |
| IV. Managed, Maintained Dependencies | No new packages | ✅ PASS |
| V. Test Discipline | Unit for match/format; e2e for already-open body capture and detail copy | ✅ PASS (tests planned alongside implementation) |

**Gate result**: PROCEED. No new permissions (003 already added `webRequest` + `scripting`).

**Post-Phase-1 re-check**: Design stores nothing new (expand is view state). Session entries still survive worker kill. Restricted-page and service-worker gaps are explicit unavailable states, not silent drops of in-scope page XHR/fetch. No new violations. Complexity Tracking empty.

## Project Structure

### Documentation (this feature)

```text
specs/005-request-log-detail/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── request-log.md
│   └── ui-components.md
└── tasks.md              # /speckit-tasks — not created here
```

### Source Code (repository root)

```text
lib/
├── types.ts                 # unchanged BodyCapture / RequestLogEntry
├── session-log.ts           # unchanged preferBody / merge
├── request-match.ts         # pickEntryForBody: completed rows, 10s, which
├── request-body.ts          # unchanged captureText
├── body-format.ts           # NEW: formatBodyForDisplay
├── request-log-observer.ts  # injectHookIntoOpenTabs; richer hook message
└── curl.ts                  # unchanged

public/
├── request-log-main.js      # request body + absolute URL + response
└── request-log-hook.js      # forward new fields

components/
├── RequestLogList.tsx       # keep 004 row; host redesigned detail
└── RequestLogDetail.tsx     # overview / request / response + copy body

entrypoints/popup/App.tsx    # clear expandedId on tab/profile/clear

tests/unit/
├── request-match.test.ts    # completed-row attach, reject filled bodies
├── body-format.test.ts      # NEW
└── request-body.test.ts     # existing

tests/e2e/
└── request-log.spec.ts      # already-open tab bodies + copy body
```

**Structure Decision**: Stay in the existing WXT layout. Capture fixes live in the public hook + `lib/request-match.ts` / observer. Presentation lives in `RequestLogDetail` plus a tiny pure formatter. No new entrypoints.

## Complexity Tracking

> No constitution violations to justify.
