# UI Contracts: Request Log Row and Detail

**Date**: 2026-08-18 | **Feature**: `005-request-log-detail`

Extends 003 `RequestLogList` / `RequestLogDetail` and 004 collapsed-row / type-filter contracts.

## `RequestLogList`

Props unchanged (`expandedId`, `onExpand`, `onCopyCurl`, …).

- Collapsed row: time, method, status, short type, truncated URL (`title` = full URL), copy cURL. One flex row. No horizontal popup scroll.
- Row button toggles expand (`aria-expanded`). Copy cURL does not call `onExpand`.
- At most one `expandedId`. Parent clears it when leaving Requests, switching profile, clearing, or the id is not in `visibleEntries`.
- Expanded row renders `RequestLogDetail` immediately below the summary, inside the same row container.
- Live `entries` updates re-render the open detail in place.

## `RequestLogDetail`

```ts
export interface RequestLogDetailProps {
  entry: RequestLogEntry;
  onCopyBody?: (message: string) => void;
}
```

Layout (top to bottom, all labeled):

1. **Overview** — method, status, resource type, and time as compact metadata chips/fields; full stored URL (selectable) with a copy-URL control.
2. **Request** — header list (post-modification, unredacted) then request body panel.
3. **Response** — header list or “Waiting for response…” then response body panel.

Each section is visually separated so pending and completed records remain scannable. Empty non-pending header lists show “No headers captured.”

Body panel:

| `BodyCapture` / state | Shown text | Copy |
|-----------------------|------------|------|
| pending + no body | Waiting for response… | disabled; “No text to copy.” |
| missing / `empty` | No body | disabled |
| `binary` | Binary body — cannot display as text | disabled |
| `unavailable` | Body not available for this resource type | disabled |
| `text` | `formatBodyForDisplay(text)`; if `truncated`, visible truncated marker | copies **stored** `text`; snackbar “Copied body” or “Copied body (truncated)” |

Copy is a control on that body only. It must not copy headers or the other body.

Long overview URLs, header lists, and body `<pre>` scroll locally (`max-height` on body). No horizontal popup scroll. The detail remains contained inside the expanded row.

## Expand reset (popup `App`)

`expandedId` is React state only. Set `null` when:

- workspace tab ≠ Requests
- `selectedProfileIndex` changes
- log is cleared
- `expandedId` is not among currently visible rows (type filter or eviction)
