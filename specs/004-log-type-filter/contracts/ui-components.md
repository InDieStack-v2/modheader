# UI Contracts: Type Filter and Log Row

**Date**: 2026-08-17 | **Feature**: `004-log-type-filter`

## `lib/resource-types.ts`

```ts
export const STANDARD_RESOURCE_TYPES: readonly {
  value: string;
  label: string;
  shortLabel: string;
}[];

export function normalizeResourceType(type: string): string;
export function visibleEntries<T extends { resourceType: string }>(
  entries: T[],
  selectedTypes: string[],
): T[];
export function toggleResourceType(
  selected: string[],
  value: string,
  mode: 'logs' | 'capture',
): string[];
```

`visibleEntries`: if `selectedTypes.length === 0`, return `entries`; else keep rows whose `normalizeResourceType(resourceType)` is in `selectedTypes`.

## `ResourceTypeToggles`

```ts
export interface ResourceTypeTogglesProps {
  value: string[];
  mode: 'logs' | 'capture';
  onChange: (next: string[]) => void;
  'aria-label'?: string;
}
```

- Renders an **All** control plus every `STANDARD_RESOURCE_TYPES` item as always-visible toggles.
- `logs` + `value=[]`: **All** is selected; type toggles are unselected. Clicking a type yields `[value]`. Clicking All while a subset is selected yields `[]`.
- `capture` mode: no All control; `value` is the actual selected types (never empty).
- Does not open a menu.

## `RequestLogList` additions

- Renders `ResourceTypeToggles` above the list (`mode="logs"`).
- Filters with `visibleEntries` before mapping rows.
- Empty + stored entries exist + filter active → “Hidden by resource type filter.”
- Collapsed row: time, method, status, short type, truncated URL (`title` = full URL), copy cURL. One flex row.

## `FilterEditor`

When `filter.type === 'types'`, render `ResourceTypeToggles mode="capture"` instead of `Select multiple`. Persist `resourceType` via existing `onChange`.
