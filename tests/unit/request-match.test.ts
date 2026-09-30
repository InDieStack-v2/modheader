import { describe, expect, it } from 'vitest';
import { createProfile } from '~/lib/profiles';
import {
  overlayHeaderRules,
  pickEntryForBody,
  pickSocketForHook,
  profileHasEnabledRules,
  profilePatchesWebSocket,
  profileWouldPatch,
  sanitizeLogUrl,
} from '~/lib/request-match';
import type { WsConnectionEntry } from '~/lib/types';

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

  it('profileHasEnabledRules ignores disabled and empty names', () => {
    const profile = createProfile([]);
    expect(profileHasEnabledRules(profile)).toBe(false);
    profile.headers = [{ enabled: false, name: 'X-Test', value: '1' }];
    expect(profileHasEnabledRules(profile)).toBe(false);
    profile.headers = [{ enabled: true, name: '   ', value: '1' }];
    expect(profileHasEnabledRules(profile)).toBe(false);
    profile.headers = [{ enabled: true, name: 'X-Test', value: '1' }];
    expect(profileHasEnabledRules(profile)).toBe(true);
    profile.respHeaders = [{ enabled: true, name: 'X-Out', value: '1' }];
    profile.headers = [];
    expect(profileHasEnabledRules(profile)).toBe(true);
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

  it('matches completed (non-pending) rows', () => {
    const done = {
      ...row('done', 1000),
      status: 200 as const,
    };
    const picked = pickEntryForBody([done], {
      method: 'POST',
      url: 'https://api.example.com/x',
      startedAt: 1200,
    });
    expect(picked?.id).toBe('done');
  });

  it('matches failed rows', () => {
    const failed = {
      ...row('fail', 1000),
      status: 'failed' as const,
    };
    expect(
      pickEntryForBody([failed], {
        method: 'POST',
        url: 'https://api.example.com/x',
        startedAt: 1000,
      })?.id,
    ).toBe('fail');
  });

  it('uses a 10s window', () => {
    expect(
      pickEntryForBody([row('far', 0)], {
        method: 'POST',
        url: 'https://api.example.com/x',
        startedAt: 10_001,
      }),
    ).toBeUndefined();
    expect(
      pickEntryForBody([row('near', 0)], {
        method: 'POST',
        url: 'https://api.example.com/x',
        startedAt: 10_000,
      })?.id,
    ).toBe('near');
  });

  it('skips rows whose target body is already text or binary', () => {
    const filled = {
      ...row('filled', 1000),
      status: 200 as const,
      responseBody: { kind: 'text' as const, text: 'already' },
    };
    expect(
      pickEntryForBody([filled], {
        method: 'POST',
        url: 'https://api.example.com/x',
        startedAt: 1000,
      }),
    ).toBeUndefined();

    const binary = {
      ...row('bin', 1000),
      responseBody: { kind: 'binary' as const },
    };
    expect(
      pickEntryForBody([binary], {
        method: 'POST',
        url: 'https://api.example.com/x',
        startedAt: 1000,
      }),
    ).toBeUndefined();
  });

  it('skips request attach when request body is already text or binary', () => {
    const filledReq = {
      ...row('req', 1000),
      requestBody: { kind: 'text' as const, text: 'posted' },
      responseBody: { kind: 'unavailable' as const },
    };
    expect(
      pickEntryForBody(
        [filledReq],
        {
          method: 'POST',
          url: 'https://api.example.com/x',
          startedAt: 1000,
        },
        'request',
      ),
    ).toBeUndefined();
  });

  it('allows request attach when only the response body is filled', () => {
    const filledResp = {
      ...row('both', 1000),
      requestBody: { kind: 'empty' as const },
      responseBody: { kind: 'text' as const, text: 'ok' },
    };
    expect(
      pickEntryForBody(
        [filledResp],
        {
          method: 'POST',
          url: 'https://api.example.com/x',
          startedAt: 1000,
        },
        'request',
      )?.id,
    ).toBe('both');
    expect(
      pickEntryForBody([filledResp], {
        method: 'POST',
        url: 'https://api.example.com/x',
        startedAt: 1000,
      }),
    ).toBeUndefined();
  });

  it('picks oldest startedAt then lowest id', () => {
    const picked = pickEntryForBody(
      [row('b', 1000), row('a', 1000)],
      { method: 'POST', url: 'https://api.example.com/x', startedAt: 1000 },
    );
    expect(picked?.id).toBe('a');
  });

  it('matches after sanitizeLogUrl of an absolute hook URL', () => {
    const stored = {
      ...row('abs', 1000),
      url: 'https://api.example.com/x',
    };
    expect(
      pickEntryForBody([stored], {
        method: 'post',
        url: 'https://user:pass@api.example.com/x#frag',
        startedAt: 1000,
      })?.id,
    ).toBe('abs');
  });

  it("defaults which to 'response'", () => {
    const onlyReqOpen = {
      ...row('open-req', 1000),
      requestBody: { kind: 'empty' as const },
      responseBody: { kind: 'text' as const, text: 'done' },
    };
    expect(
      pickEntryForBody([onlyReqOpen], {
        method: 'POST',
        url: 'https://api.example.com/x',
        startedAt: 1000,
      }),
    ).toBeUndefined();
    expect(
      pickEntryForBody(
        [onlyReqOpen],
        {
          method: 'POST',
          url: 'https://api.example.com/x',
          startedAt: 1000,
        },
        'request',
      )?.id,
    ).toBe('open-req');
  });
});

describe('profilePatchesWebSocket (spec 006)', () => {
  const input = {
    url: 'wss://api.example.com/ws',
    tabId: 1,
    paused: false,
    lockedTabId: null as number | null,
  };

  it('needs an enabled request-header rule', () => {
    const responseOnly = createProfile([]);
    responseOnly.respHeaders = [{ enabled: true, name: 'X-Resp', value: '1' }];
    expect(profilePatchesWebSocket(responseOnly, input)).toBe(false);

    const withRequest = createProfile([]);
    withRequest.headers = [{ enabled: true, name: 'X-Req', value: '1' }];
    expect(profilePatchesWebSocket(withRequest, input)).toBe(true);
  });

  it('honours type filters and tab lock', () => {
    const profile = createProfile([]);
    profile.headers = [{ enabled: true, name: 'X-Req', value: '1' }];
    profile.filters = [
      { enabled: true, type: 'types', resourceType: ['xmlhttprequest'] },
    ];
    expect(profilePatchesWebSocket(profile, input)).toBe(false);
    profile.filters = [
      { enabled: true, type: 'types', resourceType: ['websocket'] },
    ];
    expect(profilePatchesWebSocket(profile, input)).toBe(true);
    expect(profilePatchesWebSocket(profile, { ...input, lockedTabId: 2 })).toBe(
      false,
    );
  });
});

describe('pickSocketForHook (spec 006)', () => {
  function row(id: string, extra?: Partial<WsConnectionEntry>): WsConnectionEntry {
    return {
      id,
      profileIndex: 0,
      tabId: 1,
      startedAt: 1_000,
      url: 'ws://127.0.0.1:1/echo',
      state: 'open',
      requestHeaders: [],
      messagesObserved: false,
      messages: [],
      droppedMessages: false,
      ...extra,
    };
  }
  const hook = { tabId: 1, url: 'ws://127.0.0.1:1/echo#x', at: 1_500 };

  it('returns the newest unbound row for the same tab and URL', () => {
    // Lists are newest first.
    const picked = pickSocketForHook(
      [row('new', { startedAt: 1_400 }), row('old', { startedAt: 1_000 })],
      hook,
    );
    expect(picked?.id).toBe('new');
  });

  it('skips bound rows, other tabs, other URLs, and rows outside 10 s', () => {
    expect(
      pickSocketForHook(
        [
          row('bound', { hookKey: '1:0:1' }),
          row('tab', { tabId: 2 }),
          row('url', { url: 'ws://127.0.0.1:1/other' }),
          row('late', { startedAt: 1_500 + 10_001 }),
        ],
        hook,
      ),
    ).toBeUndefined();
    expect(pickSocketForHook([row('ok', { hookKey: undefined })], hook)?.id).toBe(
      'ok',
    );
  });
});
