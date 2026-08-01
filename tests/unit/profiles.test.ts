import { describe, expect, it } from 'vitest';
import {
  cloneProfile,
  createProfile,
  fixLegacyProfile,
  sortProfiles,
  wildcardToRegex,
} from '~/lib/profiles';
import type { Profile } from '~/lib/types';

describe('wildcardToRegex (contracts/profile-format.md)', () => {
  it('converts wildcards and escapes regex special chars', () => {
    expect(wildcardToRegex('*://*.example.com/*')).toBe(
      '.*:\\/\\/.*\\.example\\.com\\/.*',
    );
  });

  it('escapes backslashes', () => {
    expect(wildcardToRegex('a\\b')).toBe('a\\\\b');
  });

  it('escapes all legacy special chars (^$&+?.()|{}[]/)', () => {
    expect(wildcardToRegex('^$&+?.()|{}[]/')).toBe(
      '\\^\\$\\&\\+\\?\\.\\(\\)\\|\\{\\}\\[\\]\\/',
    );
  });

  it('always produces a valid RE2-safe regex', () => {
    for (const pattern of [
      '*://*.example.com/*',
      'https://a.b/?q=*',
      '*',
      '',
      'plain-string',
    ]) {
      expect(() => new RegExp(wildcardToRegex(pattern))).not.toThrow();
    }
  });
});

describe('createProfile', () => {
  it('names the first profile "Profile 1" with default shape', () => {
    const profile = createProfile([]);
    expect(profile.title).toBe('Profile 1');
    expect(profile.appendMode).toBe('');
    expect(profile.hideComment).toBe(true);
    expect(profile.filters).toEqual([]);
    expect(profile.headers).toHaveLength(1);
    expect(profile.respHeaders).toHaveLength(1);
  });

  it('auto-names with the smallest free index', () => {
    const existing = [
      { title: 'Profile 1' },
      { title: 'Profile 2' },
    ] as Profile[];
    expect(createProfile(existing).title).toBe('Profile 3');
  });

  it('fills gaps in numbering', () => {
    const existing = [
      { title: 'Profile 1' },
      { title: 'Profile 3' },
    ] as Profile[];
    expect(createProfile(existing).title).toBe('Profile 2');
  });
});

describe('cloneProfile', () => {
  it('titles the clone "Copy of <title>"', () => {
    const original = createProfile([]);
    original.headers[0] = { enabled: true, name: 'X-A', value: '1' };
    const clone = cloneProfile(original);
    expect(clone.title).toBe('Copy of Profile 1');
    expect(clone.headers[0]!).toEqual({ enabled: true, name: 'X-A', value: '1' });
  });

  it('is a deep copy', () => {
    const original = createProfile([]);
    const clone = cloneProfile(original);
    clone.headers[0]!.name = 'X-Mutated';
    expect(original.headers[0]!.name).toBe('');
  });
});

describe('sortProfiles', () => {
  it('sorts by title with natural numeric ordering', () => {
    const profiles = [
      { title: 'Profile 10' },
      { title: 'Profile 2' },
      { title: 'Beta' },
      { title: 'Alpha' },
    ] as Profile[];
    const sorted = sortProfiles(profiles);
    expect(sorted.map((p) => p.title)).toEqual([
      'Alpha',
      'Beta',
      'Profile 2',
      'Profile 10',
    ]);
  });

  it('does not mutate the input array', () => {
    const profiles = [{ title: 'B' }, { title: 'A' }] as Profile[];
    sortProfiles(profiles);
    expect(profiles.map((p) => p.title)).toEqual(['B', 'A']);
  });
});

describe('fixLegacyProfile', () => {
  it('converts urlPattern to urlRegex and drops urlPattern', () => {
    const profile = {
      filters: [
        { enabled: true, type: 'urls', urlPattern: '*://*.example.com/*' },
      ],
    } as unknown as Profile;
    fixLegacyProfile(profile);
    const filter = profile.filters[0]!;
    expect(filter.type).toBe('urls');
    if (filter.type === 'urls') {
      expect(filter.urlRegex).toBe('.*:\\/\\/.*\\.example\\.com\\/.*');
      expect(filter.urlPattern).toBeUndefined();
    }
  });

  it('leaves urlRegex-only filters untouched', () => {
    const profile = {
      filters: [{ enabled: true, type: 'urls', urlRegex: 'https://x\\.com/.*' }],
    } as Profile;
    fixLegacyProfile(profile);
    const filter = profile.filters[0]!;
    if (filter.type === 'urls') {
      expect(filter.urlRegex).toBe('https://x\\.com/.*');
    }
  });

  it('tolerates a profile without filters', () => {
    const profile = {} as Profile;
    expect(() => fixLegacyProfile(profile)).not.toThrow();
  });
});
