import { describe, expect, it } from 'vitest';
import { compileProfileToRules, isRe2Compatible } from '~/lib/dnr';
import { MAX_SESSION_RULES } from '~/lib/constants';
import { wildcardToRegex } from '~/lib/profiles';
import type { HeaderRule, Profile } from '~/lib/types';

function header(partial: Partial<HeaderRule>): HeaderRule {
  return { enabled: true, name: 'X-Test', value: 'v', ...partial };
}

function makeProfile(partial: Partial<Profile> = {}): Profile {
  return {
    title: 'Profile 1',
    headers: [header({})],
    respHeaders: [],
    filters: [],
    appendMode: '',
    ...partial,
  };
}

describe('compileProfileToRules — rule mapping (contracts/dnr-rules.md)', () => {
  it('returns no rules and no notices when paused', () => {
    const result = compileProfileToRules(makeProfile(), true, null);
    expect(result.rules).toEqual([]);
    expect(result.unsupported).toEqual([]);
  });

  it('maps one enabled header to one modifyHeaders rule (id from 1, priority 1)', () => {
    const { rules } = compileProfileToRules(makeProfile(), false, null);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.id).toBe(1);
    expect(rules[0]!.priority).toBe(1);
    expect(rules[0]!.action.type).toBe('modifyHeaders');
    expect(rules[0]!.action.requestHeaders).toEqual([
      { header: 'X-Test', operation: 'set', value: 'v' },
    ]);
  });

  it('ignores disabled and empty-name rows', () => {
    const profile = makeProfile({
      headers: [
        header({ enabled: false }),
        header({ name: '  ' }),
        header({ name: 'X-Real' }),
      ],
    });
    const { rules } = compileProfileToRules(profile, false, null);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.action.requestHeaders?.[0]?.header).toBe('X-Real');
  });

  it('skips malformed header names before building DNR rules', () => {
    const profile = makeProfile({
      headers: [
        header({ name: 'X Invalid' }),
        header({ name: 'X:Invalid' }),
        header({ name: 'X-Valid' }),
      ],
    });
    const { rules, unsupported } = compileProfileToRules(profile, false, null);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.action.requestHeaders?.[0]?.header).toBe('X-Valid');
    expect(unsupported).toEqual([
      { header: 'X Invalid', reason: 'invalid-header-name' },
      { header: 'X:Invalid', reason: 'invalid-header-name' },
    ]);
  });

  it('empty value maps to remove', () => {
    const profile = makeProfile({ headers: [header({ value: '' })] });
    const { rules } = compileProfileToRules(profile, false, null);
    expect(rules[0]!.action.requestHeaders).toEqual([
      { header: 'X-Test', operation: 'remove' },
    ]);
  });

  it('appendMode "append" maps request headers to append (allowlisted)', () => {
    const profile = makeProfile({
      headers: [header({ name: 'Accept', value: 'application/json' })],
      appendMode: 'append',
    });
    const { rules, unsupported } = compileProfileToRules(profile, false, null);
    expect(rules[0]!.action.requestHeaders).toEqual([
      { header: 'Accept', operation: 'append', value: 'application/json' },
    ]);
    expect(unsupported).toEqual([]);
  });

  it('appendMode "comma"/"append" degrades response headers to set + notice', () => {
    for (const appendMode of ['comma', 'append'] as const) {
      const profile = makeProfile({
        headers: [],
        respHeaders: [header({ name: 'X-Resp' })],
        appendMode,
      });
      const { rules, unsupported } = compileProfileToRules(
        profile,
        false,
        null,
      );
      expect(rules[0]!.action.responseHeaders).toEqual([
        { header: 'X-Resp', operation: 'set', value: 'v' },
      ]);
      expect(unsupported).toEqual([
        { header: 'X-Resp', reason: 'response-append' },
      ]);
    }
  });

  it('request append outside the documented allowlist is skipped with a notice', () => {
    const profile = makeProfile({
      headers: [header({ name: 'X-Custom', value: 'v' })],
      appendMode: 'append',
    });
    const { rules, unsupported } = compileProfileToRules(profile, false, null);
    expect(rules).toEqual([]);
    expect(unsupported).toEqual([
      { header: 'X-Custom', reason: 'denied-header' },
    ]);
  });

  it('multiple URL filters produce one rule per filter', () => {
    const profile = makeProfile({
      filters: [
        { enabled: true, type: 'urls', urlRegex: 'https://a\\.com/.*' },
        { enabled: true, type: 'urls', urlRegex: 'https://b\\.com/.*' },
        { enabled: false, type: 'urls', urlRegex: 'https://off\\.com/.*' },
      ],
    });
    const { rules } = compileProfileToRules(profile, false, null);
    expect(rules).toHaveLength(2);
    expect(rules.map((r) => r.condition.regexFilter)).toEqual([
      'https://a\\.com/.*',
      'https://b\\.com/.*',
    ]);
  });

  it('enabled type filters union into condition.resourceTypes', () => {
    const profile = makeProfile({
      filters: [
        { enabled: true, type: 'types', resourceType: ['main_frame'] },
        { enabled: true, type: 'types', resourceType: ['script'] },
      ],
    });
    const { rules } = compileProfileToRules(profile, false, null);
    expect(rules[0]!.condition.resourceTypes).toEqual(['main_frame', 'script']);
  });

  it('non-RE2 filters are skipped with a non-re2-filter notice', () => {
    const profile = makeProfile({
      filters: [
        { enabled: true, type: 'urls', urlRegex: 'foo(?=bar)' },
        { enabled: true, type: 'urls', urlRegex: 'https://ok\\.com/.*' },
      ],
    });
    const { rules, unsupported } = compileProfileToRules(profile, false, null);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.condition.regexFilter).toBe('https://ok\\.com/.*');
    expect(unsupported).toEqual([
      { header: 'foo(?=bar)', reason: 'non-re2-filter' },
    ]);
  });
});

describe('compileProfileToRules — invariants (contracts/dnr-rules.md)', () => {
  it('invariant 1: compiling twice yields byte-identical rules', () => {
    const profile = makeProfile({
      filters: [
        { enabled: true, type: 'urls', urlRegex: 'https://a\\.com/.*' },
        { enabled: true, type: 'types', resourceType: ['main_frame'] },
      ],
      respHeaders: [header({ name: 'X-Resp' })],
    });
    const first = compileProfileToRules(profile, false, 42);
    const second = compileProfileToRules(profile, false, 42);
    expect(JSON.stringify(first.rules)).toBe(JSON.stringify(second.rules));
    expect(JSON.stringify(first.unsupported)).toBe(
      JSON.stringify(second.unsupported),
    );
  });

  it('invariant 2: rules never exceed the session-rule cap; overflow truncates with a notice', () => {
    const filters = Array.from({ length: 2000 }, (_, i) => ({
      enabled: true,
      type: 'urls' as const,
      urlRegex: `https://host${i}\\.example\\.com/.*`,
    }));
    const profile = makeProfile({
      headers: [header({ name: 'X-A' }), header({ name: 'X-B' })],
      respHeaders: [header({ name: 'X-C' })],
      filters,
    });
    const { rules, unsupported } = compileProfileToRules(profile, false, null);
    expect(rules).toHaveLength(MAX_SESSION_RULES);
    expect(rules.length).toBeLessThanOrEqual(5000);
    expect(unsupported).toContainEqual({ header: '', reason: 'rule-limit' });
    // Truncation keeps ids unique and sequential from 1.
    expect(rules[0]!.id).toBe(1);
    expect(new Set(rules.map((r) => r.id)).size).toBe(rules.length);
  });

  it('invariant 3: legacy wildcard-derived urlRegex values always compile to valid RE2-safe rules', () => {
    const legacyPatterns = [
      '*://*.example.com/*',
      'https://example.com/path*',
      '*api*',
    ];
    const profile = makeProfile({
      filters: legacyPatterns.map((p) => ({
        enabled: true,
        type: 'urls' as const,
        urlRegex: wildcardToRegex(p),
      })),
    });
    const { rules, unsupported } = compileProfileToRules(profile, false, null);
    expect(unsupported).toEqual([]);
    expect(rules).toHaveLength(legacyPatterns.length);
    for (const rule of rules) {
      const regex = rule.condition.regexFilter as string;
      expect(isRe2Compatible(regex)).toBe(true);
      expect(() => new RegExp(regex)).not.toThrow();
    }
  });

  it('invariant 4: tabIds appears in every rule when locked, in none when unlocked', () => {
    const profile = makeProfile({
      headers: [header({ name: 'X-A' }), header({ name: 'X-B' })],
      respHeaders: [header({ name: 'X-C' })],
    });
    const locked = compileProfileToRules(profile, false, 7);
    expect(locked.rules.length).toBeGreaterThan(0);
    for (const rule of locked.rules) {
      expect(rule.condition.tabIds).toEqual([7]);
    }
    const unlocked = compileProfileToRules(profile, false, null);
    for (const rule of unlocked.rules) {
      expect(rule.condition.tabIds).toBeUndefined();
    }
  });
});

describe('compileProfileToRules — performance (T048, analysis finding E1)', () => {
  it('compiles a representative profile (50 headers + filters) well under 500ms', () => {
    const profile = makeProfile({
      headers: Array.from({ length: 25 }, (_, i) =>
        header({ name: `X-Req-${i}`, value: `value-${i}` }),
      ),
      respHeaders: Array.from({ length: 25 }, (_, i) =>
        header({ name: `X-Resp-${i}`, value: `value-${i}` }),
      ),
      filters: [
        { enabled: true, type: 'urls', urlRegex: '.*:\/\/example\.com\/.*' },
        { enabled: true, type: 'urls', urlRegex: '.*:\/\/api\.example\.com\/.*' },
        { enabled: true, type: 'types', resourceType: ['xmlhttprequest'] },
      ],
    });
    const start = performance.now();
    const { rules } = compileProfileToRules(profile, false, null);
    const elapsed = performance.now() - start;
    expect(rules.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(500);
  });
});
