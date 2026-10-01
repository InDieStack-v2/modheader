# Implementation Plan: Profile Request Logs

**Branch**: `003-profile-request-logs` | **Date**: 2026-08-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-profile-request-logs/spec.md`

## Summary

Split the active profile workspace into **Headers** (existing editor) and **Requests**. Request recording is opt-in per profile via a start/pause control. While recording, the background observes network requests, keeps only those the active profile actually patches (same filter + enabled-rule semantics as DNR), and stores a session-scoped log: post-modification header snapshot (secrets in full), text bodies (64 KB cap), status, and resource type. The Requests tab updates live; each row can copy a cURL of the **patched** request. Recording and logs live in `chrome.storage.session` so they survive popup close and worker restarts, and both reset on a full browser restart.

Capture uses non-blocking `webRequest` (new permission, justified). Response bodies are available for `xmlhttprequest` / `fetch` via a MAIN-world hook registered only while recording (`scripting` permission). Other resource types still log headers/status; their response-body panel shows not-available.

## Technical Context

**Language/Version**: TypeScript ~5.9.3 (strict), React 19.2

**Primary Dependencies**: WXT 0.21, MUI 9.2, `wxt/browser` — no new runtime packages. cURL builder and filter matcher are first-party `lib/` modules.

**Storage**: `chrome.storage.session` for recording flags + log entries (FR-013). `chrome.storage.local` / profile documents **unchanged** (FR-020). If `storage.session` is missing, fall back to `storage.local` keys wiped on `runtime.onStartup`.

**Testing**: Vitest (match/patch predicate, URL sanitize, body decode/cap, cURL builder, log cap/remap). Playwright e2e (workspace tabs, start/pause, indicator, live row, expand bodies, copy cURL) on Chrome; Firefox covered by the same suite where the project already runs e2e.

**Target Platform**: Chrome MV3 and Firefox MV3 (WXT dual build)

**Project Type**: browser-extension (popup + background observer + optional content hook)

**Performance Goals**: New request row / status update visible within 2s while Requests is open (SC-003, FR-021); popup still interactive &lt; 1s on open; observer idle when no profile is recording.

**Constraints**: No blocking `webRequest` (Chrome MV3). No `onRuleMatchedDebug` (unpacked-only). `storage.session` quota 10 MB — evict oldest entries if a write would exceed, even before the 200 cap. New permissions minimized: `webRequest`, `scripting`. Self-contained build; no network-fetched code.

**Scale/Scope**: 1 popup workspace split, 2 new UI components, 1 lib observer + 1 cURL helper, session-store helpers, content-script hook registered only while recording, ~200 entries × 2 × 64 KB bodies worst case (evicted earlier if quota binds).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Modern Build Toolchain | Same WXT/Vite build; no runtime fetching | ✅ PASS |
| II. Cross-Browser Compatibility | Same observer + hook path on Chrome and Firefox; Firefox `storage.session` feature-detected | ✅ PASS |
| III. Simplicity & Minimal Change (YAGNI) | No debugger API, no new npm deps, no profile-schema change; observer registered only while recording | ✅ PASS |
| IV. Managed, Maintained Dependencies | No new packages | ✅ PASS |
| V. Test Discipline | Unit tests for pure log/cURL/match logic; e2e for the Requests tab flows | ✅ PASS (tests planned alongside implementation) |

**Gate result**: PROCEED. Two new permissions are justified in [research.md](research.md) (D1, D3) and do not violate “minimized.”

**Post-Phase-1 re-check**: Design uses `storage.session` (survives worker kill, not in-memory-only). Profile documents and export/backup contracts unchanged. Response-body degradation for non-XHR is user-visible (FR-023). No new violations. Complexity Tracking empty.

## Project Structure

### Documentation (this feature)

```text
specs/003-profile-request-logs/
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
├── types.ts                 # + RequestLogEntry, RequestLogState, BodyCapture
├── storage.ts               # unchanged local keys
├── session-log.ts           # NEW: session-store get/set/subscribe, cap, remap
├── request-match.ts         # NEW: profileWouldPatch + sanitizeUrl
├── request-body.ts          # NEW: decode/truncate/classify text vs binary
├── curl.ts                  # NEW: entry → cURL string
└── dnr.ts                   # unchanged compiler; match helper may import filter types

entrypoints/
├── background.ts            # + observer lifecycle, webRequest listeners
├── popup/App.tsx            # workspace Headers|Requests tabs; recording chip
└── request-log-hook.ts      # NEW: content script (MAIN world), registered only while recording

components/
├── RequestLogList.tsx       # NEW: start/pause, list, expand, copy cURL
└── RequestLogDetail.tsx     # NEW: header snapshot + request/response bodies

tests/unit/
├── request-match.test.ts
├── request-body.test.ts
├── curl.test.ts
└── session-log.test.ts

tests/e2e/
└── request-log.spec.ts      # NEW
```

**Structure Decision**: Stay in the existing WXT layout. New logic lives in `lib/` (unit-tested). UI is two components under `components/`. The content hook is an entrypoint so WXT can register it dynamically; it is **not** always injected.

## Complexity Tracking

> No constitution violations to justify.
