export const STANDARD_RESOURCE_TYPES = [
  { value: 'main_frame', label: 'Main Frame', shortLabel: 'Doc' },
  { value: 'sub_frame', label: 'Sub Frame', shortLabel: 'Frame' },
  { value: 'stylesheet', label: 'Stylesheet', shortLabel: 'CSS' },
  { value: 'script', label: 'Script', shortLabel: 'JS' },
  { value: 'image', label: 'Image', shortLabel: 'Img' },
  { value: 'object', label: 'Object', shortLabel: 'Obj' },
  { value: 'xmlhttprequest', label: 'XHR', shortLabel: 'XHR' },
  { value: 'websocket', label: 'WebSocket', shortLabel: 'WS' },
  { value: 'other', label: 'Other', shortLabel: 'Other' },
] as const;

/** WebSocket rows live in their own tab, so the Logs filter never offers it. */
export function resourceTypesFor(mode: 'logs' | 'capture') {
  return mode === 'logs'
    ? STANDARD_RESOURCE_TYPES.filter((t) => t.value !== 'websocket')
    : STANDARD_RESOURCE_TYPES;
}

const KNOWN: Set<string> = new Set(
  STANDARD_RESOURCE_TYPES.map((t) => t.value),
);

export function normalizeResourceType(type: string): string {
  return KNOWN.has(type) ? type : 'other';
}

export function visibleEntries<T extends { resourceType: string }>(
  entries: T[],
  selectedTypes: string[],
): T[] {
  if (selectedTypes.length === 0) {
    return entries;
  }
  const allowed = new Set(selectedTypes);
  return entries.filter((entry) =>
    allowed.has(normalizeResourceType(entry.resourceType)),
  );
}

export function toggleResourceType(
  selected: string[],
  value: string,
  mode: 'logs' | 'capture',
): string[] {
  if (value === 'all') {
    return mode === 'logs' ? [] : selected;
  }
  if (mode === 'logs' && selected.length === 0) {
    return [value];
  }
  if (selected.includes(value)) {
    if (mode === 'capture' && selected.length === 1) {
      return selected;
    }
    const next = selected.filter((item) => item !== value);
    return next;
  }
  return [...selected, value];
}

export function typeShortLabel(type: string): string {
  const known = STANDARD_RESOURCE_TYPES.find(
    (item) => item.value === normalizeResourceType(type),
  );
  return known?.shortLabel ?? 'Other';
}
