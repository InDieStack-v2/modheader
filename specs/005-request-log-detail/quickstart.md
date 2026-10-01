# Quickstart: Expandable Request Log Detail — Validation Guide

**Date**: 2026-08-18 | **Feature**: `005-request-log-detail`

Contracts: [request-log.md](contracts/request-log.md), [ui-components.md](contracts/ui-components.md). Types: [data-model.md](data-model.md).

## Prerequisites

```bash
npm install
```

## Automated checks (Constitution V)

```bash
npm run compile
npm run lint
npm run test          # pickEntryForBody, formatBodyForDisplay, body merge
npm run test:e2e      # includes already-open-tab body capture + expand/copy
```

## Manual scenario 1 — Expand / collapse (US1)

1. `npm run dev`, load `.output/chrome-mv3`, start recording, generate two patched requests.
2. Open Requests. Click the first row (not cURL). **Expected**: detail opens under that row.
3. Click the second row. **Expected**: first collapses; only the second is open.
4. Click the open row again. **Expected**: collapsed.
5. Click copy cURL on a collapsed row. **Expected**: snackbar; row stays collapsed.
6. Switch to Headers and back. **Expected**: all rows collapsed.

## Manual scenario 2 — Bodies on an already-open tab (US2, FR-017, FR-018, SC-009)

This is the failure mode that shipped empty bodies.

1. Open a normal https page **first** (leave it loaded).
2. Open the popup → Requests → **Start**. Do **not** reload the page.
3. From that page’s console (or in-page script), `fetch` a patched POST with a JSON body to a matching origin that returns JSON (local echo is fine).
4. Expand the new row. **Expected** within a few seconds:
   - Request body shows the JSON you sent (formatted if valid JSON), not “No body” / “unavailable”.
   - Response body shows the JSON that came back, not “unavailable”.
5. Copy each body. Paste. **Expected**: stored text (not required to keep pretty-print whitespace). Truncated copies say so.
6. Repeat with `GET`. **Expected**: request body “No body”; response body is the text payload or explicit empty.

## Manual scenario 3 — Enhanced detail (US3)

1. Expand a completed XHR row.
2. **Expected**: bordered, labeled Overview (method/status/type chips, time, full URL), Request (headers + body), and Response (headers + body) sections. Secret header values still shown in full.
3. Copy the request URL from Overview. **Expected**: the stored URL is placed on the clipboard and the existing notification confirms success.
4. A long URL or body scrolls inside the detail. The popup does not grow sideways.

## Manual scenario 4 — Out of scope stays honest

1. A patched document/image row: response body may stay “not available for this resource type.”
2. A service-worker-initiated call: row may exist; response body may stay unavailable.
3. Restricted pages (Web Store, `chrome://`): Start still works; those tabs may not get bodies.

## Manual scenario 5 — Firefox

1. `npm run dev:firefox`, repeat scenarios 1–3.
2. **Expected**: same user-visible behavior, including already-open-tab capture.

## Cross-check

- Type filter, recording start/pause, 200-cap, export/backup exclusion, and unredacted cURL from 003/004 still hold.
- Global pause still turns recording off; existing rows (and their bodies) remain.
