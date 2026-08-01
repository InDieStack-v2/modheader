import type { Profile } from './types';

/** Characters escaped by the legacy wildcard→regex algorithm (src/scripts/main.js:1). */
const SPECIAL_CHARS = new Set('^$&+?.()|{}[]/'.split(''));

/**
 * Legacy wildcard→regex conversion (port of src/scripts/main.js:8-30).
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
  // Legacy `addHeader` (src/scripts/main.js:58-65) creates an enabled empty row.
  return { enabled: true, name: '', value: '', comment: '' };
}

/**
 * Create a profile with a unique auto-name `Profile N` (smallest free N).
 * Port of legacy `dataSource.createProfile` (src/scripts/main.js:136-151).
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
 * Port of legacy `profileService.cloneProfile` (src/scripts/main.js:231-236).
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
 * In-place migration of legacy wildcard `urlPattern` filters to `urlRegex`.
 * Port of legacy `fixProfile` (src/scripts/main.js:8-30).
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
