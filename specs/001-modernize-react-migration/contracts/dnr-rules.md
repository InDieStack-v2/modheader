# Contract: DNR Rule Compilation

Defines how a `Profile` + runtime state becomes `chrome.declarativeNetRequest` session
rules. Implemented in `lib/dnr.ts`; consumed only by the background worker, but its
behavior is a correctness contract verified by unit tests and the SC-004 regression suite.

## Inputs

- `profile: Profile` (selected profile)
- `paused: boolean`
- `lockedTabId: number | null`

## Output

`{ rules: chrome.declarativeNetRequest.Rule[], unsupported: UnsupportedNotice[] }`

- `paused === true` → `rules: []`, `unsupported: []`.
- Otherwise one rule per enabled, valid, non-empty-named header in `headers` and `respHeaders`.

Header names are trimmed and must use the HTTP field-name token grammar. Disabled,
empty, or malformed names are skipped with an `invalid-header-name` notice.

## Rule mapping (per header)

| Field | Mapping |
|-------|---------|
| id | Sequential from 1 (session rules are fully replaced each compile) |
| priority | 1 |
| action.type | `modifyHeaders` |
| action.requestHeaders / responseHeaders | `[{ header: name, operation, value? }]` |
| operation | `appendMode === ''` → `set`; `'comma'`/`'append'` → `append` for request headers, `set` + notice for response headers; empty `value` → `remove` |
| condition.regexFilter | From the profile's single enabled URL filter group; multiple URL filters produce one rule **per URL filter** (DNR conditions OR across rules) |
| condition.resourceTypes | From the enabled type filter, else omitted |
| condition.tabIds | `[lockedTabId]` when set |

## UnsupportedNotice

`{ header: string, reason: 'response-append' | 'non-re2-filter' | 'denied-header' | 'invalid-header-name' }` —
rendered in the popup so degradation is user-visible (FR-008, SC-004). The denied-header
list is produced by the implementation spike and stored in `lib/constants.ts`.

## Invariants (unit-tested)

1. Compiling twice with the same input yields byte-identical rules (determinism).
2. Rules never exceed the guaranteed session-rule minimum (5,000); overflow → truncate
   with a notice.
3. Legacy wildcard-derived `urlRegex` values always compile to valid RE2.
4. `tabIds` appears in every rule when locked, in none when unlocked.

## Documented limitations (T013, docs-based; real-browser spike pending)

From the official Chrome declarativeNetRequest reference
(https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest)
and MDN/Firefox DNR docs. **A real-browser capability spike on Chrome and
Firefox is still required** — until it runs, `DENIED_HEADERS` in
`lib/constants.ts` stays empty and this list is the authoritative degradation
documentation (SC-004):

1. **`append` is request-header only, and only for a documented allowlist.**
   Chrome supports `append` solely for: `accept`, `accept-encoding`,
   `accept-language`, `access-control-request-headers`, `cache-control`,
   `connection`, `content-language`, `cookie`, `forwarded`, `if-match`,
   `if-none-match`, `keep-alive`, `range`, `te`, `trailer`,
   `transfer-encoding`, `upgrade`, `user-agent`, `via`, `want-digest`,
   `x-forwarded-for` (encoded as `APPENDABLE_REQUEST_HEADERS`). Appending to
   any other request header makes the rule invalid — and since
   `updateSessionRules` is atomic, one invalid rule rejects the whole update —
   so the compiler skips such headers with a `denied-header` notice.
   Append-mode response headers degrade to `set` + `response-append` notice
   (already in the mapping table).
2. **`regexFilter` is RE2-only and ASCII-only.** Patterns using
   lookahead/lookbehind or backreferences are invalid; the compiler flags them
   with `non-re2-filter` notices and skips them. Chrome additionally limits
   regex rules to 1000 per ruleset (`MAX_NUMBER_OF_REGEX_RULES`) and each
   compiled regex to <2KB — not enforced at compile time; surfaces as a
   rejected rule update at runtime (spike follow-up).
3. **Rule caps.** Session rules cap at 5000 (`MAX_NUMBER_OF_SESSION_RULES`,
   Chrome 120+) — enforced by invariant 2 truncation. `tabIds` conditions are
   only supported on session-scoped rules (we only use session rules, so no
   impact).
4. **Browser-managed headers.** No fixed list of unmodifiable headers is
   published for Chrome or Firefox; Safari does not support custom headers at
   all (out of scope). Any headers found unmodifiable by the pending spike go
   into `DENIED_HEADERS` and produce `denied-header` notices at compile time.
