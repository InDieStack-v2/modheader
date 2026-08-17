# UI Contracts: Profile Request Logs

**Date**: 2026-08-17 | **Feature**: `003-profile-request-logs`

Extends the 002 compact popup. No change to `ProfileTabBar` props.

## App workspace tabs

Under the existing compact toolbar (title, pause, tab-lock, more):

```text
[ Headers | Logs ]
```

- MUI `Tabs`. Default `Headers` on popup open and whenever `selectedProfileIndex` changes.
- `Headers` renders the current `FilterEditor` + request/response `HeaderTable`s unchanged.
- `Logs` renders `RequestLogList`.
- Switching these tabs does not change the active profile, pause, or recording.

## Recording indicator (FR-022)

In the compact status row, when `requestLogRecording[selectedIndex] === true`:

- A small chip/dot labeled so it is distinct from the global **Paused** control (e.g. “Recording”).
- Not clickable for pause. Pause remains on the Logs tab.

On the Logs tab label, a visual mark when that profile is recording (dot or count).

## RequestLogList (`components/RequestLogList.tsx`)

```ts
export interface RequestLogListProps {
  profileIndex: number;
  recording: boolean;
  canRecord?: boolean;
  entries: RequestLogEntry[];
  onToggleRecording: () => void;
  onClear: () => void;
}
```

Behavioral contract:

- Start/pause control reflects `recording` (FR-006, FR-007). Start is disabled when `canRecord` is false (global pause or no enabled header rules).
- Empty + paused → “Start recording to capture patched requests.”
- Empty + cannot record → “Recording stays off while nothing is being modified.”
- Empty + recording → “Matching patched requests will appear here.”
- Rows newest first; list scrolls inside the tab.
- Each **collapsed** row shows: time, method, truncated URL, resource type, status, copy-cURL action (FR-024). Optional one-line summary of profile-applied header names.
- Copy-cURL does not require expand. Success → existing snackbar. If `bodyOmitted`, snackbar says the body was skipped.
- Expand/select a row renders `RequestLogDetail`.

## RequestLogDetail (`components/RequestLogDetail.tsx`)

```ts
export interface RequestLogDetailProps {
  entry: RequestLogEntry;
}
```

- Request headers, then response headers (or “waiting” while pending).
- Request body panel: text / empty / binary / truncated marker.
- Response body panel: text / waiting / empty / binary / unavailable / truncated.

## Permissions copy

If `webRequest` or `scripting` is missing at runtime (should not happen after install), Logs shows a single error state: recording cannot start. No silent failure.
