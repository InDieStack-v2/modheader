# Data Model: Modernize ModHeader

All entities are JSON-serializable and stored via `chrome.storage.local` unless noted.
Field names preserve the legacy format so old data parses unchanged (FR-004).

## Profile

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| title | string | yes | Unique per profile list; auto-named `Profile N` on create |
| headers | HeaderRule[] | yes | Request headers; defaults to one empty disabled row |
| respHeaders | HeaderRule[] | yes | Response headers; same default |
| filters | Filter[] | yes | May be empty (= applies everywhere) |
| appendMode | `'' \| 'comma' \| 'append'` | yes | `''` = override; response-header append degrades per research D4 |
| hideComment | boolean | no | UI preference, default `true` |

## HeaderRule

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| enabled | boolean | yes | Disabled rules are ignored by the DNR compiler |
| name | string | yes | Empty-name rows are ignored; case-insensitive matching |
| value | string | yes | May be empty string (= header removal semantics via DNR `remove`) |
| comment | string | no | Display only |

## Filter

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| enabled | boolean | yes | |
| type | `'urls' \| 'types'` | yes | URL pattern vs resource-type filter |
| urlRegex | string | conditional | Present when `type === 'urls'`; RE2-compatible required for DNR |
| urlPattern | string | legacy | Wildcard form; compiled to `urlRegex` on load, then dropped |
| resourceType | string[] | conditional | DNR resource types when `type === 'types'` |

**Filter semantics (unchanged from legacy)**: within enabled filters, URL filters are
OR-ed, type filters are OR-ed, and the two groups are AND-ed; a group with no enabled
entries passes everything.

## RuntimeState (storage.local keys)

| Key | Type | Notes |
|-----|------|-------|
| profiles | Profile[] | Replaces `localStorage.profiles` |
| selectedProfileIndex | number | Replaces `localStorage.selectedProfile` |
| isPaused | boolean | Absent = not paused |
| lockedTabId | number | Absent = all tabs |
| activeTabUrl | string | Best-effort, from `tabs` API |
| migrationDone | boolean | Set after legacy localStorage migration |

## CloudBackup (storage.sync)

- **Legacy format** (must remain readable): key = `"<ms timestamp>"`, value = serialized
  `Profile[]` string.
- **New chunked format**: manifest item key = `"backup:<ts>:meta"`, value =
  `{ chunks: number, createdAt: string }`; chunk items `backup:<ts>:<i>` hold string
  slices ≤ 7 KB (margin below the 8 KB quota). Retention: newest 50 snapshots.
- **Validation**: any snapshot that fails to parse as `Profile[]` is skipped, never
  fatal (legacy behavior).

## State Transitions

**Pause**: `isPaused` set/unset → background removes all session rules (paused) or
recompiles them (unpaused) → badge switches to ⏸ / count.

**Tab lock**: `lockedTabId` set → recompile rules with `condition.tabIds = [lockedTabId]`;
unset → recompile without `tabIds`. Lock to a closed tab = rules simply match nothing.

**Profile change** (edit/switch/create/delete/clone/import/restore): popup writes
`storage.local` → `storage.onChanged` fires in background → session rules recompiled
atomically → badge count updated.

**Migration** (once, after upgrade): `onInstalled` → migration page reads legacy
`localStorage` → writes `storage.local` keys → `migrationDone = true` → legacy keys left
in place (read-only safety net; deleted only on explicit user action, out of scope).
