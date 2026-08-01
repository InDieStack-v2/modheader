<!--
  Sync Impact Report
  ------------------
  Version change: 1.0.0 -> 2.0.0 (MAJOR: backward-incompatible redefinition of
  Principles I, IV, V, mandated by feature 001-modernize-react-migration)
  Modified principles:
    - I. Zero-Build Development -> I. Modern Build Toolchain (redefined)
    - II. Cross-Browser Compatibility -> unchanged
    - III. Simplicity & Minimal Change (YAGNI) -> unchanged
    - IV. Vendored Dependencies Only -> IV. Managed, Maintained Dependencies (redefined)
    - V. Manual Verification Discipline -> V. Test Discipline (redefined)
  Added sections: none (existing sections revised in place)
  Removed sections: none
  Templates requiring updates:
    - .specify/templates/plan-template.md     : OK (generic Constitution Check placeholder)
    - .specify/templates/spec-template.md     : OK (generic; no principle-driven sections)
    - .specify/templates/tasks-template.md    : ✅ updated ("tests optional" note now defers
      to constitution Principle V)
  Command files: no outdated agent-specific references in .kimi-code/skills/
  Runtime guidance docs:
    - README.md : ✅ updated (Installation section now reflects the build toolchain; full
      rewrite remains task T046 of feature 001)
  Follow-up TODOs:
    - tasks.md T047 (constitution amendment) is satisfied by this amendment; check it off
      during implementation.
-->

# ModHeader Constitution

## Core Principles

### I. Modern Build Toolchain

The extension is built with the project's configured toolchain (WXT/Vite + TypeScript).
A single documented command MUST produce installable packages for both Chrome and
Firefox from a clean checkout. Built artifacts MUST be fully self-contained: no runtime
fetching of code, libraries, or styles from the network.

Rationale: the UI is React + TypeScript (owner-mandated in feature
001-modernize-react-migration), which cannot run unbundled; self-contained artifacts
preserve the offline guarantees the old zero-build rule protected.

### II. Cross-Browser Compatibility

Every feature MUST work in both Chrome and Firefox using each store's currently
supported extension platform. Browser-specific APIs MUST be feature-detected and guarded
with a working fallback, or rejected. A feature that only works in one browser is not
done.

Rationale: ModHeader ships to both the Chrome Web Store and Firefox Add-ons from a single
codebase; divergence would double the maintenance surface.

### III. Simplicity & Minimal Change (YAGNI)

Changes MUST be minimal and scoped to the goal: no speculative abstractions, no unrelated
refactors, no new dependencies for marginal benefit. Per the project's contribution
policy, changes that add significant complexity for little benefit will be rejected.
Three similar lines are preferable to a premature abstraction.

### IV. Managed, Maintained Dependencies

Dependencies are managed through npm and locked by the project's lockfile. No runtime
dependency of the shipped extension may be end-of-life or unmaintained. Adding or
upgrading a dependency MUST be justified in the change description and limited to the
minimum necessary scope. Vendoring a library by copying it into the source tree is
prohibited except for assets that are not publishable packages (e.g., icons).

Rationale: the old vendoring rule kept the extension offline and predictable; the same
guarantees are now provided by lockfile-pinned, self-contained builds plus the
no-end-of-life requirement (FR-006 of feature 001).

### V. Test Discipline

Core logic (anything under `lib/` or equivalent non-UI modules) MUST have unit tests, and
major user flows MUST have end-to-end browser tests. Tests for a change MUST be written
before or alongside its implementation, and the suites (`npm run test`,
`npm run test:e2e`) MUST pass before a change is considered done. Release sign-off
additionally requires the manual cross-browser verification scenarios in the active
feature's quickstart guide.

Rationale: owner-mandated in feature 001 (Clarifications, 2026-07-31) to protect data
migration and feature parity; manual verification alone cannot guard 13 features across
two browsers against regressions.

## Technology & Platform Constraints

- Manifest V3 on both browsers; header modification MUST use declarativeNetRequest
  (blocking webRequest is unavailable on Chrome's current platform).
- Permissions: `declarativeNetRequestWithHostAccess`, `storage`, `contextMenus`, `tabs`
  plus `host_permissions: <all_urls>`. Permission additions MUST be justified and
  minimized.
- Target stack: TypeScript (strict) + React + MUI for the popup; WXT for builds.
- User data MUST persist via `chrome.storage.local`; cloud backup via
  `chrome.storage.sync` with quota-safe chunking. Legacy `localStorage` is read only for
  one-time migration.
- All runtime state MUST survive background worker restarts; no in-memory-only state.
- `manifest.json` version follows the extension's existing MAJOR.MINOR.PATCH scheme and
  is bumped only on releases, not per change.

## Development Workflow

1. `npm install`, then `npm run dev` (Chrome) or `npm run dev:firefox` for live reload.
2. Implement the change with a minimal diff (Principle III) and the required tests
   (Principle V).
3. `npm run test`, `npm run test:e2e`, and `npm run lint` MUST pass.
4. Verify on both browsers for any change touching extension APIs (Principle II).
5. Before merge, review against every principle in this constitution; any violation MUST
   be either fixed or explicitly justified and recorded in the change description.

## Governance

This constitution supersedes ad-hoc practices for this project. Amendments require:

- A documented rationale for the change and its expected impact.
- A version bump following semantic versioning: MAJOR for backward-incompatible principle
  removals or redefinitions, MINOR for new principles or materially expanded guidance,
  PATCH for clarifications and non-semantic wording fixes.
- An update to `LAST_AMENDED_DATE` and a Sync Impact Report prepended to this file when
  principles or sections change.

All reviews MUST verify compliance with the principles above. Complexity that conflicts
with Principle III MUST be justified in writing. For runtime development guidance, use
`README.md`.

**Version**: 2.0.0 | **Ratified**: 2026-07-31 | **Last Amended**: 2026-07-31
