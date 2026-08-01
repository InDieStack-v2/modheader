# Feature Specification: Modernize ModHeader (Outdated/Risk Fixes + React/TypeScript Refactor)

**Feature Branch**: `001-modernize-react-migration`

**Created**: 2026-07-31

**Status**: Draft

**Input**: User description: "fix all outdated / risks issues & refactor angularJS to reactjs + typescript"

## Clarifications

### Session 2026-07-31

- Q: Which mechanism should modify headers now that Chrome MV3 removed blocking web-request APIs? → A: declarativeNetRequest on both Chrome and Firefox (single unified mechanism, graceful degradation for unmodifiable headers)
- Q: Should the modernization introduce automated tests or keep manual verification only? → A: Full suite: unit tests for core logic plus end-to-end browser tests for all major flows
- Q: Keep cloud backup's silent sync-quota failures or fix them? → A: Fix within browser-sync storage: chunk large snapshots to fit quotas, keep old snapshots readable, notify user on failure

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Extension Works on Current Browsers (Priority: P1)

An end user installs or updates ModHeader on a current version of Chrome or Firefox.
The extension installs without deprecation warnings, is accepted by the extension stores,
and modifies request/response headers exactly as before.

**Why this priority**: The current extension platform (Manifest V2) is deprecated and being
disabled in Chrome. Without this, the extension stops working entirely for all users —
every other story is moot.

**Independent Test**: Load the built extension into a current stable Chrome and Firefox,
configure a request header, and verify the header is present on outgoing requests (e.g.,
via a header-echo service).

**Acceptance Scenarios**:

1. **Given** a current stable Chrome, **When** the user installs the extension,
   **Then** it installs with no "Manifest V2 deprecated" or similar warnings and appears
   enabled in the toolbar.
2. **Given** the extension is installed with an enabled request header rule, **When** the
   user navigates to any website, **Then** the configured header is sent with the request.
3. **Given** an enabled response header rule, **When** a page loads, **Then** the response
   headers are modified as configured.

---

### User Story 2 - Full Feature Parity After Rewrite (Priority: P2)

An end user relies on ModHeader's existing feature set: multiple profiles, URL and
resource-type filters, header comments, sorting, append mode, profile clone,
import/export, cloud backup/restore, tab locking, pause/unpause, and toolbar badge
indicators. After the rewrite, every one of these features works the same way.

**Why this priority**: The rewrite must not regress user-facing functionality; parity is
the acceptance bar for replacing the existing codebase.

**Independent Test**: Execute the documented feature checklist (each feature above) against
the rewritten extension and confirm each behaves as it does in the current release.

**Acceptance Scenarios**:

1. **Given** two profiles with different headers, **When** the user switches profiles,
   **Then** only the selected profile's headers are applied to subsequent requests.
2. **Given** a URL filter restricting modification to one domain, **When** the user visits
   a different domain, **Then** no headers are modified there.
3. **Given** the extension is paused, **When** requests are made, **Then** no headers are
   modified and the paused state is visibly indicated.
4. **Given** tab lock is enabled on tab A, **When** the user browses in tab B, **Then** no
   headers are modified in tab B.
5. **Given** profiles previously backed up to cloud sync, **When** the user opens cloud
   backup in the rewritten extension, **Then** those backups are listed and restorable.

---

### User Story 3 - Existing User Data Preserved on Upgrade (Priority: P2)

An existing user upgrades from the old extension version to the rewritten one. All of
their profiles, headers, filters, settings, and pause/lock state are carried over
automatically with no manual export/import step.

**Why this priority**: Losing user configuration on upgrade is the highest-impact failure
mode of a rewrite; it must be handled invisibly.

**Independent Test**: Install the current release, create varied profiles (headers,
filters, append mode, comments), then upgrade to the rewritten build and verify all data
appears and functions identically.

**Acceptance Scenarios**:

1. **Given** the old version with 3 configured profiles, **When** the extension updates,
   **Then** all 3 profiles with their headers, filters, and settings are present and the
   previously selected profile remains selected.
2. **Given** a profile created by the old version containing legacy URL wildcard patterns,
   **When** loaded in the rewritten extension, **Then** those patterns still match the same
   URLs.

---

### User Story 4 - Maintainable Modern Codebase (Priority: P3)

A maintainer or contributor works on the codebase: the UI is built with a supported
component framework and a statically typed language (user-specified: React + TypeScript),
no dependency is past end-of-life, deprecated platform APIs are gone, and a single command
produces store-ready packages for both browsers.

**Why this priority**: This is the "why" of the rewrite — long-term maintainability and
security — but it delivers no user-visible change by itself, so it ranks below
functionality preservation.

**Independent Test**: Audit the dependency manifest for EOL packages, run the build
command, and confirm both browser packages are produced and installable.

**Acceptance Scenarios**:

1. **Given** the project repository, **When** a contributor runs the documented build
   command, **Then** installable packages for both Chrome and Firefox are produced without
   manual steps.
2. **Given** the rewritten codebase, **When** its dependencies are audited, **Then** none
   are end-of-life and none use deprecated platform APIs.

---

### Edge Cases

- What happens when an existing user has profiles stored only in old-format local storage
  and cloud sync simultaneously? (Both sources must be reconciled without duplication or
  loss.)
- How does the extension behave if the browser kills and restarts the background worker
  between events? (State must survive restarts; no reliance on long-lived in-memory state.)
- What happens when a modified header conflicts with browser-managed headers that can no
  longer be changed on the modern platform? (Graceful degradation with clear user feedback.)
- How are very large profiles (many headers/filters) handled during migration and at
  runtime? (No data truncation; performance remains interactive.)
- What happens if cloud-synced backup data was written by the old version and read by the
  new one (and vice versa during a rollback)? (Both directions must parse safely.)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The extension MUST load, install, and run on current stable Chrome and
  Firefox using each store's currently supported extension platform (no deprecated
  manifest version).
- **FR-002**: The extension MUST preserve all existing end-user features: add/modify/remove
  request headers and response headers, URL-pattern and resource-type filters, header
  comments, multiple profiles, profile switching/clone/delete, header sorting, append mode
  (override/comma-append/append), profile import/export, cloud backup/restore, tab locking,
  pause/unpause, and toolbar badge state indicators.
- **FR-003**: On upgrade, existing user data (profiles, selected profile, pause/lock state)
  MUST be migrated automatically to the new storage mechanism with no user action and no
  data loss.
- **FR-004**: Data written by the old version (local profiles, cloud-sync backups) MUST
  remain readable by the rewritten extension, including legacy URL wildcard patterns.
- **FR-005**: The popup UI MUST be rebuilt using React and TypeScript, as specified by the
  project owner.
- **FR-006**: No runtime dependency of the shipped extension may be end-of-life or
  unmaintained; specifically, AngularJS and Angular Material MUST be removed.
- **FR-007**: Deprecated web APIs MUST be replaced with supported equivalents (e.g.,
  clipboard copy must use the asynchronous Clipboard API, not `document.execCommand`).
- **FR-008**: Header modification MUST be implemented with declarativeNetRequest on both
  Chrome and Firefox (a single shared mechanism); where a previously modifiable header
  cannot be modified via declarativeNetRequest, the extension MUST degrade gracefully and
  inform the user, and each such limitation MUST be documented.
- **FR-009**: A single documented command MUST produce installable, store-ready packages
  for both Chrome and Firefox.
- **FR-010**: Build outputs MUST exclude junk files and development artifacts (e.g.,
  `.DS_Store`-style OS files, source maps not intended for release).
- **FR-011**: The rewritten extension MUST NOT require persistent background-page state;
  all runtime state MUST survive background restarts.
- **FR-012**: The existing behavior of applying modifications only to a locked tab, and of
  pausing all modifications, MUST work identically after the rewrite.
- **FR-013**: The rewritten codebase MUST include an automated test suite: unit tests for
  core logic (header rule compilation, filter matching, data migration) and end-to-end
  browser tests covering all major user flows listed in FR-002.
- **FR-014**: Cloud backup MUST continue to use browser-sync storage, but snapshots that
  exceed the per-item sync quota MUST be split into quota-sized chunks for writing and
  reassembled on read; snapshots written by the old version (single-item format) MUST
  remain restorable, and any backup failure MUST be surfaced to the user instead of
  failing silently.

### Key Entities *(include if feature involves data)*

- **Profile**: A named set of header rules and settings; contains request headers,
  response headers, filters, append mode, and comment-visibility preference. Users can
  have many profiles; exactly one is selected at a time.
- **Header Rule**: A single header name/value pair with an enabled flag and an optional
  comment; belongs to a profile as either a request or response header.
- **Filter**: A URL wildcard/regex pattern or a resource-type list, with an enabled flag,
  restricting where a profile's header rules apply.
- **Cloud Backup**: A timestamped snapshot of all profiles stored in browser-sync storage,
  shared between the old and new versions. Large snapshots are stored as multiple
  quota-sized chunks that are reassembled on read; old single-item snapshots remain valid.
- **Runtime State**: Selected profile index, paused flag, locked tab ID, and active tab
  URL — must persist across background restarts on the modern platform.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The extension is accepted by both the Chrome Web Store and Firefox Add-ons
  review processes on their current platforms (no rejections for deprecated platform use).
- **SC-002**: 100% of the documented feature checklist (every feature in FR-002) passes
  manual verification on both browsers.
- **SC-003**: In upgrade testing across at least 3 representative profile configurations,
  100% of existing profiles and settings are preserved with zero data loss.
- **SC-004**: Header modification outcomes match the previous release in 100% of a defined
  regression scenario suite (request headers, response headers, filters, append modes),
  excluding a documented list of headers the modern extension platform cannot modify;
  every excluded case MUST show the user a clear limitation notice.
- **SC-005**: Dependency audit reports zero end-of-life runtime dependencies in the shipped
  extension.
- **SC-006**: A new contributor can go from a clean checkout to installable packages for
  both browsers with a single build command in under 5 minutes (excluding one-time
  dependency installation).

## Assumptions

- The project owner has explicitly mandated React + TypeScript for the UI rewrite and
  migration to the current extension platform (Manifest V3); these are fixed constraints,
  not open design questions.
- UI/UX parity with the current popup is the goal — this is a modernization, not a
  redesign; minor visual differences from component-library changes are acceptable.
- Cloud backup continues to use the browser's built-in sync storage (no server-side
  component is introduced).
- A Node.js-based build toolchain is acceptable for development; the constitution's
  "Zero-Build Development" principle (I) and "Manual Verification Discipline" principle (V)
  will be amended accordingly as part of this work.
- An automated test suite (unit + end-to-end) is in scope for this effort, per the project
  owner's decision recorded in Clarifications.
- Feature scope is limited to what exists today; no new user-facing features are added in
  this effort.
