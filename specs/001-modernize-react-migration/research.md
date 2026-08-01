# Research: Modernize ModHeader

Resolves all technical unknowns from the plan's Technical Context.

## Decision 1: Extension framework — WXT

- **Decision**: Use WXT (Vite-based extension framework) with its React template.
- **Rationale**: Core requirement is dual-browser MV3 from one codebase. WXT generates
  per-target manifests, bundles the background as a Chrome service worker and a Firefox
  event page, ships `wxt zip` for store packages (replacing our `scripts/build.mjs`),
  and documents Playwright E2E testing. Chrome and Firefox both support DNR
  `modifyHeaders` with custom headers (confirmed via
  [WebKit bug 290922](https://bugs.webkit.org/show_bug.cgi?id=290922): "Unlike Chrome and
  Firefox, Safari doesn't support custom headers").
- **Alternatives considered**: Vite + @crxjs/vite-plugin (Chrome-first, weak Firefox MV3
  support); Plasmo (heavier, opinionated directory conventions); hand-rolled webpack
  (violates simplicity principle).

## Decision 2: Header modification — DNR session rules

- **Decision**: Compile the selected profile into
  `chrome.declarativeNetRequest` **session rules** (not dynamic rules), rebuilt whenever
  the profile, pause state, or tab lock changes.
- **Rationale**: Session rules live in memory and never persist stale state — matching
  the old extension's rebuild-on-change behavior and surviving worker restarts trivially
  (recompile on worker start). Updates are atomic per
  [updateSessionRules](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest).
  Guaranteed minimum of 5,000 session rules is far beyond realistic profile sizes.
- **Alternatives considered**: Dynamic rules (persist across restarts — unnecessary, and
  risk stale rules on downgrade/rollback); static rulesets (cannot react to profile edits).

## Decision 3: Permissions

- **Decision**: `permissions: ["declarativeNetRequestWithHostAccess", "storage",
  "contextMenus", "tabs"]`, `host_permissions: ["<all_urls>"]`.
- **Rationale**: `modifyHeaders` requires host access; parity demands all URLs.
  `tabs` replaces the old trick of harvesting tab URLs from webRequest events (DNR rules
  are declarative — the extension never sees requests). This removes the old
  `webRequest`/`webRequestBlocking` permissions entirely, a store-review plus.
- **Alternatives considered**: `declarativeNetRequest` + `webRequest` feedback variants
  (unnecessary permissions); optional host permissions (breaks out-of-box parity).

## Decision 4: Known DNR limitations → graceful degradation list (SC-004)

- **Decision**: Detect unsupported configurations at rule-compile time and surface them
  in the popup. Initial documented limitation list (verified at implementation spike T0
  and locked into the regression suite):
  1. `append` operation is only defined for **request** headers; append-mode response
     headers fall back to `set` with a user notice.
  2. User regex filters must be RE2-compatible for `regexFilter`; non-RE2 patterns are
     flagged in the UI and skipped (legacy wildcard-generated patterns are always RE2-safe).
  3. A small set of browser-managed headers may not be modifiable; exact list is produced
     by the spike and encoded as a compile-time denylist with UI notice.
- **Rationale**: FR-008/SC-004 require documented, user-visible degradation rather than
  silent no-ops.
- **Alternatives considered**: Firefox-only blocking webRequest fallback (rejected in
  Clarification Q1 — two code paths).

## Decision 5: State storage & migration

- **Decision**: All state moves to `chrome.storage.local` (`profiles`,
  `selectedProfileIndex`, `isPaused`, `lockedTabId`, `activeTabUrl`). One-time migration
  from `localStorage` runs in an **extension-page context** on first run after upgrade:
  Chrome MV3 service workers have no `localStorage`, but extension pages do — so the
  background opens a hidden migration page/offscreen document on `onInstalled`, reads the
  legacy keys, writes `storage.local`, marks `migrationDone`, and closes. Firefox MV3
  event pages are DOM documents and can migrate directly.
- **Rationale**: FR-003 demands zero-action migration even if the user never opens the
  popup; the offscreen-document path works headlessly on Chrome.
- **Implementation note (T039/T040)**: if the offscreen document does not signal
  completion within 8s (its scripts never execute under Chrome for Testing 151, observed
  in the e2e environment), the background falls back to opening the same migration page
  as an inactive tab, which the page closes via the same `modheader:migration-data`
  message handshake. Offscreen remains the primary path on real Chrome. The page only
  reads localStorage and sends the payload to the service worker, which owns all
  storage writes, because chrome.storage is unreliable inside offscreen documents on
  real Chrome (runtime messaging is their supported API).
- **Alternatives considered**: Migrate lazily on popup open (violates FR-003 — headers
  would silently stop working until first popup open); keep localStorage (absent in SW).

## Decision 6: Cloud backup chunking

- **Decision**: Keep `chrome.storage.sync`; serialize profiles as before; if the payload
  exceeds the 8 KB per-item quota, split into ordered chunk items under a manifest key;
  on read, detect both old single-item snapshots and new chunked ones. Surface write
  failures (quota/100 KB total) via popup toast. Cap retained snapshots at 50 (existing
  behavior) and count chunks toward quota management.
- **Rationale**: Implements FR-014 with backward compatibility (FR-004).
- **Alternatives considered**: `storage.local`-only backups (loses sync-across-devices);
  external service (rejected in Clarification Q3).

## Decision 7: UI stack

- **Decision**: React 19 + TypeScript strict + MUI v7, with plain React state + context
  (no Redux); popup persists via the same `storage.local` schema the background reads,
  so the old "save on unload" hack is replaced by save-on-change.
- **Rationale**: MUI gives the closest visual parity to Angular Material (Spec Assumption:
  modernization, not redesign). A store library is unjustified for one popup screen
  (simplicity principle).
- **Alternatives considered**: Mantine/Chakra (larger visual divergence); Preact
  (owner mandated React); Redux/Zustand (over-engineering for this surface).

## Decision 8: Testing

- **Decision**: Vitest for unit tests (`lib/` pure functions: DNR compiler, migration,
  chunking, profile ops); Playwright for E2E loading the built extension in Chromium and
  Firefox, asserting real header modification against a local echo server, plus the
  migration scenario (seed legacy localStorage, upgrade, verify).
- **Rationale**: FR-013; WXT documents and templates this exact combination.
- **Alternatives considered**: Jest (slower, redundant with Vite pipeline); Puppeteer
  (weaker Firefox support than Playwright).

## Decision 9: Deprecated API replacements

- **Decision**: `document.execCommand('copy')` → `navigator.clipboard.writeText` (popup
  context has clipboard permission via user gesture); `$mdToast.simple().content()` →
  MUI Snackbar; `browserAction` → MV3 `action`; Chrome-72 version sniffing → deleted.
- **Rationale**: FR-007.
