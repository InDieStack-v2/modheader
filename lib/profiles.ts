import type { Profile } from './types';

/** Characters escaped by the wildcard→regex algorithm. */
const SPECIAL_CHARS = new Set('^$&+?.()|{}[]/'.split(''));

/**
 * Wildcard→regex conversion.
 * Escapes `^$&+?.()|{}[]/`, `\` → `\\`, `*` → `.*`.
 */
export function wildcardToRegex(urlPattern: string): string {
  const joiner: string[] = [];
  for (let i = 0; i < urlPattern.length; ++i) {
    let c = urlPattern.charAt(i);
    if (SPECIAL_CHARS.has(c)) {
      c = '\\' + c;
    } else if (c === '\\') {
      c = '\\\\';
    } else if (c === '*') {
      c = '.*';
    }
    joiner.push(c);
  }
  return joiner.join('');
}

function emptyHeaderRow() {
  // New header rows start enabled and empty.
  return { enabled: true, name: '', value: '', comment: '' };
}

/**
 * Create a profile with a unique auto-name `Profile N` (smallest free N).
 */
export function createProfile(existingProfiles: Profile[] = []): Profile {
  const titles = new Set(existingProfiles.map((p) => p.title));
  let index = 1;
  while (titles.has(`Profile ${index}`)) {
    ++index;
  }
  return {
    title: `Profile ${index}`,
    hideComment: true,
    headers: [emptyHeaderRow()],
    respHeaders: [emptyHeaderRow()],
    filters: [],
    appendMode: '',
  };
}

/**
 * Deep-clone a profile, titled `Copy of <title>`.
 */
export function cloneProfile(profile: Profile): Profile {
  const clone = structuredClone(profile);
  clone.title = `Copy of ${clone.title}`;
  return clone;
}

/**
 * Return a copy of the list sorted by title using natural (numeric-aware)
 * ordering, so `Profile 2` sorts before `Profile 10`. Input is not mutated.
 */
export function sortProfiles(profiles: Profile[]): Profile[] {
  return [...profiles].sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { numeric: true }),
  );
}

/**
 * Return a copy of the list with the element at `from` moved to `to`
 * (tab-bar drag-reorder, spec 002 FR-007). Indices are clamped to valid
 * positions; `from === to` returns an equivalent copy. Input is not mutated.
 */
export function reorderProfiles(
  profiles: Profile[],
  from: number,
  to: number,
): Profile[] {
  const clamp = (i: number) => Math.max(0, Math.min(profiles.length - 1, i));
  const result = [...profiles];
  const [moved] = result.splice(clamp(from), 1);
  result.splice(clamp(to), 0, moved!);
  return result;
}

/**
 * In-place migration of legacy wildcard `urlPattern` filters to `urlRegex`.
 */
export function fixLegacyProfile(profile: Profile): void {
  if (profile.filters) {
    for (const filter of profile.filters) {
      if (filter.type === 'urls' && filter.urlPattern) {
        filter.urlRegex = wildcardToRegex(filter.urlPattern);
        delete filter.urlPattern;
      }
    }
  }
}
