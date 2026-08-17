import { DENIED_HEADERS } from './constants';
import { isRe2Compatible } from './dnr';
import type {
  HeaderRule,
  NameValue,
  Profile,
  RequestLogEntry,
  TypeFilter,
  UrlFilter,
} from './types';

/** Origin + path + query; drop userinfo and fragment (FR-014). */
export function sanitizeLogUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}${parsed.search}`;
  } catch {
    const noHash = url.split('#')[0] ?? url;
    const at = noHash.indexOf('@');
    const scheme = noHash.indexOf('://');
    if (at > 0 && scheme >= 0 && at > scheme) {
      return noHash.slice(0, scheme + 3) + noHash.slice(at + 1);
    }
    return noHash;
  }
}

function hasEnabledPatchRule(rows: HeaderRule[] | undefined): boolean {
  return (rows ?? []).some((row) => {
    if (!row.enabled || row.name.trim() === '') {
      return false;
    }
    return !DENIED_HEADERS.includes(row.name.trim().toLowerCase());
  });
}

/** True when this profile would install at least one request or response patch. */
export function profileHasEnabledRules(profile: Profile): boolean {
  return (
    hasEnabledPatchRule(profile.headers) ||
    hasEnabledPatchRule(profile.respHeaders)
  );
}

/**
 * True when this profile would install at least one DNR modifyHeaders rule
 * that applies to the request (same grouping as compileProfileToRules).
 */
export function profileWouldPatch(
  profile: Profile,
  input: {
    url: string;
    resourceType: string;
    tabId: number | undefined;
    paused: boolean;
    lockedTabId: number | null;
  },
): boolean {
  if (input.paused) {
    return false;
  }
  if (
    input.lockedTabId != null &&
    (input.tabId == null || input.tabId !== input.lockedTabId)
  ) {
    return false;
  }
  if (!profileHasEnabledRules(profile)) {
    return false;
  }

  const filters = profile.filters ?? [];
  const urlFilters = filters.filter(
    (f): f is UrlFilter =>
      f.type === 'urls' && f.enabled && isRe2Compatible(f.urlRegex ?? ''),
  );
  const resourceTypes = [
    ...new Set(
      filters
        .filter((f): f is TypeFilter => f.type === 'types' && f.enabled)
        .flatMap((f) => f.resourceType ?? []),
    ),
  ];

  if (urlFilters.length > 0) {
    const matchesUrl = urlFilters.some((f) => {
      try {
        return new RegExp(f.urlRegex).test(input.url);
      } catch {
        return false;
      }
    });
    if (!matchesUrl) {
      return false;
    }
  }

  if (resourceTypes.length > 0 && !resourceTypes.includes(input.resourceType)) {
    return false;
  }

  return true;
}

/** Overlay this profile's set/remove rules onto observed headers (research D2). */
export function overlayHeaderRules(
  observed: NameValue[],
  rules: HeaderRule[] | undefined,
): NameValue[] {
  const map = new Map<string, NameValue>();
  for (const header of observed) {
    map.set(header.name.toLowerCase(), {
      name: header.name,
      value: header.value,
    });
  }
  for (const rule of rules ?? []) {
    if (!rule.enabled || rule.name.trim() === '') {
      continue;
    }
    const key = rule.name.trim().toLowerCase();
    if (rule.value === '') {
      map.delete(key);
    } else {
      map.set(key, { name: rule.name.trim(), value: rule.value });
    }
  }
  return [...map.values()];
}

const BODY_MATCH_WINDOW_MS = 2000;

/** Oldest pending same method+url within 2s, no body yet (contract tie-break). */
export function pickEntryForBody(
  entries: RequestLogEntry[],
  input: { method: string; url: string; startedAt: number },
): RequestLogEntry | undefined {
  const method = input.method.toUpperCase();
  const url = sanitizeLogUrl(input.url);
  const candidates = entries.filter((entry) => {
    if (entry.status !== 'pending') {
      return false;
    }
    if (entry.method.toUpperCase() !== method) {
      return false;
    }
    if (sanitizeLogUrl(entry.url) !== url) {
      return false;
    }
    if (Math.abs(entry.startedAt - input.startedAt) > BODY_MATCH_WINDOW_MS) {
      return false;
    }
    if (entry.responseBody && entry.responseBody.kind !== 'unavailable') {
      return false;
    }
    return true;
  });
  candidates.sort((a, b) => {
    if (a.startedAt !== b.startedAt) {
      return a.startedAt - b.startedAt;
    }
    return a.id.localeCompare(b.id);
  });
  return candidates[0];
}
