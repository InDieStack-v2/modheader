import type { Browser } from 'wxt/browser';
import {
  APPENDABLE_REQUEST_HEADERS,
  DENIED_HEADERS,
  MAX_SESSION_RULES,
} from './constants';
import type {
  HeaderRule,
  Profile,
  TypeFilter,
  UnsupportedNotice,
  UrlFilter,
} from './types';

export type DnrRule = Browser.declarativeNetRequest.Rule;
type ModifyHeaderInfo = Browser.declarativeNetRequest.ModifyHeaderInfo;
type RuleCondition = Browser.declarativeNetRequest.RuleCondition;

export interface CompileResult {
  rules: DnrRule[];
  unsupported: UnsupportedNotice[];
}

/**
 * RE2 has no lookahead/lookbehind or backreferences; anything that is not even
 * a valid JS regex is not valid RE2 either. This is a conservative client-side
 * check — the spike (T013) may extend it using
 * `declarativeNetRequest.isRegexSupported`.
 */
const NON_RE2_TOKENS = /\\[1-9]|\(\?[=!]|\(\?<[=!]/;

export function isRe2Compatible(pattern: string): boolean {
  if (NON_RE2_TOKENS.test(pattern)) {
    return false;
  }
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

/**
 * Compile a Profile + runtime state into DNR session rules.
 * Implements contracts/dnr-rules.md — behavior there is the correctness contract.
 */
export function compileProfileToRules(
  profile: Profile,
  paused: boolean,
  lockedTabId: number | null,
): CompileResult {
  if (paused) {
    return { rules: [], unsupported: [] };
  }

  const unsupported: UnsupportedNotice[] = [];
  const filters = profile.filters ?? [];

  // URL filters are OR-ed: one rule per enabled, RE2-safe URL filter.
  const urlFilters = filters
    .filter((f): f is UrlFilter => f.type === 'urls' && f.enabled)
    .filter((f) => {
      if (isRe2Compatible(f.urlRegex ?? '')) {
        return true;
      }
      unsupported.push({ header: f.urlRegex ?? '', reason: 'non-re2-filter' });
      return false;
    });

  // Type filters are OR-ed: union of enabled resource types.
  const resourceTypes = [
    ...new Set(
      filters
        .filter((f): f is TypeFilter => f.type === 'types' && f.enabled)
        .flatMap((f) => f.resourceType ?? []),
    ),
  ];

  const baseCondition: Partial<RuleCondition> = {};
  if (resourceTypes.length > 0) {
    baseCondition.resourceTypes =
      resourceTypes as RuleCondition['resourceTypes'];
  }
  if (lockedTabId != null) {
    baseCondition.tabIds = [lockedTabId];
  }
  const conditions: Partial<RuleCondition>[] = urlFilters.length
    ? urlFilters.map((f) => ({ ...baseCondition, regexFilter: f.urlRegex }))
    : [baseCondition];

  interface CompiledHeader {
    target: 'requestHeaders' | 'responseHeaders';
    op: ModifyHeaderInfo;
  }

  const isDenied = (name: string) =>
    DENIED_HEADERS.includes(name.trim().toLowerCase());

  const compileRows = (
    rows: HeaderRule[],
    isResponse: boolean,
  ): CompiledHeader[] => {
    const compiled: CompiledHeader[] = [];
    for (const row of rows ?? []) {
      if (!row.enabled || row.name.trim() === '') {
        continue; // disabled and empty-name rows are ignored
      }
      const name = row.name.trim();
      if (isDenied(name)) {
        unsupported.push({ header: name, reason: 'denied-header' });
        continue;
      }
      let op: ModifyHeaderInfo;
      if (row.value === '') {
        op = { header: name, operation: 'remove' };
      } else if (isResponse) {
        if (profile.appendMode !== '') {
          // DNR `append` is not defined for response headers: degrade to `set`.
          unsupported.push({ header: name, reason: 'response-append' });
        }
        op = { header: name, operation: 'set', value: row.value };
      } else if (profile.appendMode === '') {
        op = { header: name, operation: 'set', value: row.value };
      } else if (APPENDABLE_REQUEST_HEADERS.includes(name.toLowerCase())) {
        op = { header: name, operation: 'append', value: row.value };
      } else {
        // Chrome rejects append for request headers outside its documented
        // allowlist, and updateSessionRules is atomic — one invalid rule would
        // reject the whole update. Skip with a notice instead (T013 docs).
        unsupported.push({ header: name, reason: 'denied-header' });
        continue;
      }
      compiled.push({
        target: isResponse ? 'responseHeaders' : 'requestHeaders',
        op,
      });
    }
    return compiled;
  };

  const compiledHeaders = [
    ...compileRows(profile.headers, false),
    ...compileRows(profile.respHeaders, true),
  ];

  const rules: DnrRule[] = [];
  let nextId = 1;
  for (const { target, op } of compiledHeaders) {
    for (const condition of conditions) {
      rules.push({
        id: nextId++,
        priority: 1,
        action: { type: 'modifyHeaders', [target]: [op] },
        condition: { ...condition } as RuleCondition,
      });
    }
  }

  // Invariant 2: never exceed the guaranteed session-rule minimum.
  if (rules.length > MAX_SESSION_RULES) {
    rules.length = MAX_SESSION_RULES;
    unsupported.push({ header: '', reason: 'rule-limit' });
  }

  return { rules, unsupported };
}
