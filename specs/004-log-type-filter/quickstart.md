# Quickstart: Log Type Filter and Row Redesign

**Date**: 2026-08-17 | **Feature**: `004-log-type-filter`

## Automated

```bash
npm run compile
npm run lint
npm run test
npm run test:e2e -- --project=chromium
```

## Manual / e2e scenarios

### 1 — Logs type filter (US1, SC-001, SC-002, SC-005)

1. Record a page load + XHR against the echo server (as in 003).
2. On Logs, the full type toggle row is visible (document, XHR, script, …).
3. Click **XHR** only. **Expected**: only `xmlhttprequest` rows; other captured types hidden; recording still on.
4. Click **XHR** again (last type). **Expected**: all rows return (filter = all). Stored count unchanged.

### 2 — Redesigned row (US2, SC-003, SC-004)

1. With mixed rows visible, each collapsed row shows method, status, type, and URL as separate fields.
2. Long URL is truncated; hover shows the full URL.
3. Copy cURL still works from the collapsed row in 1 click.
4. Expand still shows headers/bodies.

### 3 — Headers capture multi-select (US3)

1. On Headers, add/use a Resource Type filter.
2. **Expected**: same always-visible toggles, not a dropdown.
3. Select XHR + Script. Both stay selected and visible.
4. Deselect Script. Only XHR remains. Deselect XHR. **Expected**: XHR stays (cannot clear the last capture type).

### 4 — Session memory (FR-005)

1. Set Logs filter to XHR, close popup, reopen. **Expected**: still XHR-only.
2. Clear log. **Expected**: filter back to all types.
