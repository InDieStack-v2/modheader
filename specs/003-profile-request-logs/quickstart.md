# Quickstart: Profile Request Logs — Validation Guide

**Date**: 2026-08-17 | **Feature**: `003-profile-request-logs`

Contracts: [request-log.md](contracts/request-log.md), [ui-components.md](contracts/ui-components.md). Types: [data-model.md](data-model.md).

## Prerequisites

```bash
npm install
```

## Automated checks (Constitution V)

```bash
npm run compile
npm run lint
npm run test          # includes request-match, request-body, curl, session-log
npm run test:e2e      # includes tests/e2e/request-log.spec.ts
```

## Manual scenario 1 — Workspace tabs (US1)

1. `npm run dev`, load `.output/chrome-mv3`, open the popup.
2. **Expected**: workspace shows **Headers | Logs**; Headers is selected; filters and header tables work as today.
3. Switch to Logs and back. **Expected**: editor content intact; active profile unchanged.
4. Switch profile in the left bar. **Expected**: Headers is selected again.

## Manual scenario 2 — Opt-in recording (US2, FR-005..FR-013)

1. Profile adds `X-Test: 1` and a URL filter for `https://example.com/.*`.
2. Open Logs. **Expected**: recording off; empty state tells you to start.
3. Without starting, load `https://example.com`. Reopen Logs. **Expected**: still empty.
4. Start recording. Chip “Recording” appears in the status row (visible if you switch to Headers).
5. Load `https://example.com` and `https://example.org`. **Expected**: only the example.com request appears; type + status fill in within 2s.
6. Pause. Reload example.com. **Expected**: no new row; old row remains.
7. Close the popup, reload example.com, reopen. **Expected**: recording still on; the new row is there.
8. Fully quit and restart the browser, open the popup. **Expected**: recording off, log empty.

## Manual scenario 3 — Bodies and cURL (US4)

1. Record a patched `POST` (JSON body + JSON response) to a matching origin (e.g. a local echo).
2. Expand the row. **Expected**: request and response header snapshots include this profile’s header; request and response bodies are readable.
3. Click copy cURL on the **collapsed** row (do not expand first). Paste. **Expected**: method, stored URL, patched headers (real `Authorization`/`Cookie` if present), and `--data-raw` with the JSON.
4. Expand a GET image/document row if one was patched. **Expected**: request body empty; response body “unavailable” is acceptable.

## Manual scenario 4 — Firefox

1. `npm run dev:firefox`, repeat scenarios 1–3.
2. **Expected**: same user-visible behavior. Session reset on full Firefox restart still holds (`storage.session` or onStartup fallback).

## Cross-check

- Export / cloud backup a profile while a log exists. Restore elsewhere. **Expected**: no log entries and recording off (FR-018).
- Global pause while recording. **Expected**: recording turns off, existing rows remain, no new rows, only the Paused chip stays (Recording is gone). Unpause does not restart recording.
