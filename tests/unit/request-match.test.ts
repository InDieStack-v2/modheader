import { describe, expect, it } from 'vitest';
import { createProfile } from '~/lib/profiles';
import {
  overlayHeaderRules,
  pickEntryForBody,
  profileWouldPatch,
  sanitizeLogUrl,
} from '~/lib/request-match';

describe('sanitizeLogUrl', () => {
  it('strips userinfo and fragment, keeps query', () => {
    expect(
      sanitizeLogUrl('https://user:pass@api.example.com/v1/x?q=1#frag'),
    ).toBe('https://api.example.com/v1/x?q=1');
  });

  it('keeps origin and path', () => {
    expect(sanitizeLogUrl('http://localhost:8080/echo')).toBe(
      'http://localhost:8080/echo',
    );
  });
});

describe('profileWouldPatch', () => {
  const base = {
    url: 'https://api.example.com/v1',
    resourceType: 'xmlhttprequest',
    tabId: 1,
    paused: false,
    lockedTabId: null as number | null,
  };

  function profileWithHeader() {
    const profile = createProfile([]);
    profile.headers = [{ enabled: true, name: 'X-Test', value: '1' }];
    return profile;
  }

  it('is false when paused', () => {
    expect(profileWouldPatch(profileWithHeader(), { ...base, paused: true })).toBe(
      false,
    );
  });

  it('is false when no enabled rules', () => {
    const profile = createProfile([]);
    profile.headers = [{ enabled: false, name: 'X-Test', value: '1' }];
    expect(profileWouldPatch(profile, base)).toBe(false);
  });

  it('matches empty filters (applies everywhere)', () => {
    expect(profileWouldPatch(profileWithHeader(), base)).toBe(true);
  });

  it('matches an enabled URL filter', () => {
    const profile = profileWithHeader();
    profile.filters = [
      { enabled: true, type: 'urls', urlRegex: 'https://api\\.example\\.com/.*' },
    ];
    expect(profileWouldPatch(profile, base)).toBe(true);
    expect(
      profileWouldPatch(profile, { ...base, url: 'https://other.example/x' }),
    ).toBe(false);
  });

  it('matches type filters', () => {
    const profile = profileWithHeader();
    profile.filters = [
      { enabled: true, type: 'types', resourceType: ['xmlhttprequest'] },
    ];
    expect(profileWouldPatch(profile, base)).toBe(true);
    expect(
      profileWouldPatch(profile, { ...base, resourceType: 'image' }),
    ).toBe(false);
  });

  it('respects tab lock', () => {
    expect(
      profileWouldPatch(profileWithHeader(), {
        ...base,
        lockedTabId: 9,
        tabId: 1,
      }),
    ).toBe(false);
    expect(
      profileWouldPatch(profileWithHeader(), {
        ...base,
        lockedTabId: 9,
        tabId: 9,
      }),
    ).toBe(true);
  });
});

describe('overlayHeaderRules', () => {
  it('sets and removes names without duplicating', () => {
    const result = overlayHeaderRules(
      [
        { name: 'Accept', value: '*/*' },
        { name: 'X-Old', value: 'a' },
      ],
      [
        { enabled: true, name: 'X-Test', value: '1' },
        { enabled: true, name: 'X-Old', value: '' },
      ],
    );
    expect(result.find((h) => h.name === 'X-Test')?.value).toBe('1');
    expect(result.find((h) => h.name.toLowerCase() === 'x-old')).toBeUndefined();
    expect(result.find((h) => h.name === 'Accept')?.value).toBe('*/*');
  });
});

describe('pickEntryForBody', () => {
  const row = (id: string, startedAt: number) => ({
    id,
    profileIndex: 0,
    startedAt,
    method: 'POST',
    url: 'https://api.example.com/x',
    resourceType: 'xmlhttprequest',
    status: 'pending' as const,
    requestHeaders: [],
    responseBody: { kind: 'unavailable' as const },
  });

  it('picks the oldest pending same method+url within 2s', () => {
    const picked = pickEntryForBody(
      [row('b', 1500), row('a', 1000)],
      { method: 'POST', url: 'https://api.example.com/x', startedAt: 1200 },
    );
    expect(picked?.id).toBe('a');
  });
});
