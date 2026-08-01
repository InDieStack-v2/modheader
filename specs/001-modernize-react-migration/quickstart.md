# Quickstart: Build & Validate the Modernized ModHeader

## Prerequisites

- Node.js ≥ 20 and npm
- Current stable Chrome and Firefox
- Clean checkout of branch `001-modernize-react-migration`

## Setup & Build

```bash
npm install          # one-time
npm run dev          # dev build with HMR (Chrome); `npm run dev:firefox` for Firefox
npm run build        # production builds: .output/chrome-mv3 + .output/firefox-mv3
npm run zip          # store-ready zips for both browsers (supersedes scripts/build.mjs)
```

Expected: both builds complete without errors; zips contain no OS junk files (FR-010).

## Load Manually

- **Chrome**: `chrome://extensions` → Developer mode → Load unpacked → `.output/chrome-mv3`
- **Firefox**: `about:debugging#/runtime/this-firefox` → Load Temporary Add-on →
  `.output/firefox-mv3/manifest.json`

## Automated Validation

```bash
npm run test         # Vitest unit tests (dnr compiler, migration, chunking, profiles)
npm run test:e2e     # Playwright: real header modification + parity + migration flows
```

## Manual Validation Scenarios (feature parity, FR-002)

1. **Header modification**: add request header `X-Test: 1` → visit
   `https://httpbin.org/headers` → header visible in echoed request.
2. **Response header**: add response header rule → verify in DevTools Network panel.
3. **Filters**: scope profile to `https://httpbin.org/.*` → header applied there, not on
   `https://example.com`.
4. **Profiles**: create/clone/switch/delete; verify each applies its own rules (badge
   count updates).
5. **Append mode**: comma-append to an existing header → confirm merged value (request);
   response append shows degradation notice (contract: dnr-rules.md).
6. **Pause / tab lock**: pause → no modification, ⏸ badge; lock to tab → modification
   only in that tab, 🔒 badge elsewhere.
7. **Import/export**: export a profile, import into a fresh profile → identical behavior;
   paste malformed JSON → "Failed to import profile".
8. **Cloud backup**: trigger backup (profile change) → open Cloud Backup dialog → restore
   an older snapshot; create a >8 KB profile → backup succeeds (chunked) and restores
   intact; restore a snapshot written by the **old** extension version → works (FR-004).
9. **Migration**: install old ModHeader 2.3.2, configure profiles, then load the new
   build over it → profiles/settings appear unchanged, modification works immediately
   (FR-003).
10. **Worker restart**: kill the background worker (chrome://serviceworker-internals or
    idle timeout) → next navigation still gets headers modified (FR-011).

## Expected Outcomes

- All 10 scenarios pass on both browsers → SC-002/SC-004.
- No deprecated-platform warnings on install → SC-001 readiness.
- Migration scenario shows zero data loss → SC-003.
