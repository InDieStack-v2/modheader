/**
 * Shared constants (T007): autocomplete header lists, sync quota constants,
 * DNR rule limits, and the denied-header denylist (documented limitations, T013).
 */

/** Request header autocomplete names. */
export const REQUEST_HEADER_NAMES: readonly string[] = [
  'Authorization',
  'Cache-Control',
  'Connection',
  'Content-Length',
  'Host',
  'If-Modified-Since',
  'If-None-Match',
  'If-Range',
  'Partial-Data',
  'Pragma',
  'Proxy-Authorization',
  'Proxy-Connection',
  'Transfer-Encoding',
  'Accept',
  'Accept-Charset',
  'Accept-Encoding',
  'Accept-Language',
  'Accept-Datetime',
  'Cookie',
  'Content-MD5',
  'Content-Type',
  'Date',
  'Expect',
  'From',
  'If-Match',
  'If-Unmodified-Since',
  'Max-Forwards',
  'Origin',
  'Range',
  'Referer',
  'TE',
  'User-Agent',
  'Upgrade',
  'Via',
  'Warning',
  'X-Forwarded-For',
  'X-Forwarded-Host',
  'X-Forwarded-Proto',
  'Front-End-Https',
  'X-Http-Method-Override',
  'X-ATT-DeviceId',
  'X-Wap-Profile',
  'X-UIDH',
  'X-Csrf-Token',
];
export const REQUEST_HEADER_VALUES: readonly string[] = [];

/** Response header autocomplete names. */
export const RESPONSE_HEADER_NAMES: readonly string[] = [
  'Access-Control-Allow-Origin',
  'Accept-Patch',
  'Accept-Ranges',
  'Age',
  'Allow',
  'Connection',
  'Content-Disposition',
  'Content-Encoding',
  'Content-Language',
  'Content-Length',
  'Content-Location',
  'Content-MD5',
  'Content-Range',
  'Content-Type',
  'Date',
  'ETag',
  'Expires',
  'Last-Modified',
  'Link',
  'Location',
  'P3P',
  'Pragma',
  'Proxy-Authenticate',
  'Public-Key-Pins',
  'Refresh',
  'Retry-After',
  'Server',
  'Set-Cookie',
  'Strict-Transport-Security',
  'Trailer',
  'Transfer-Encoding',
  'Upgrade',
  'Vary',
  'Via',
  'Warning',
  'WWW-Authenticate',
  'X-Frame-Options',
  'X-XSS-Protection',
  'Content-Security-Policy',
  'X-Content-Type-Options',
  'X-Powered-By',
  'X-UA-Compatible',
  'X-Content-Duration',
  'X-Content-Security-Policy',
  'X-WebKit-CSP',
];
export const RESPONSE_HEADER_VALUES: readonly string[] = [];

/** chrome.storage.sync quota: 8 KB per item (QUOTA_BYTES_PER_ITEM). */
export const SYNC_QUOTA_BYTES_PER_ITEM = 8192;
/** Backup chunk slice size: 7 KB, margin below the 8 KB per-item quota (research D6). */
export const BACKUP_CHUNK_MAX_BYTES = 7168;
/** Cloud backup retention: newest 50 snapshots (legacy behavior). */
export const MAX_BACKUP_SNAPSHOTS = 50;

/**
 * Guaranteed session-rule limit (MAX_NUMBER_OF_SESSION_RULES = 5000, Chrome 120+;
 * matches contracts/dnr-rules.md invariant 2).
 */
export const MAX_SESSION_RULES = 5000;

/**
 * Headers that browsers refuse to modify via declarativeNetRequest (matched
 * case-insensitively at compile time; rules for these are skipped with a
 * `denied-header` UnsupportedNotice).
 *
 * T013: currently EMPTY. No fixed denylist is published in the official Chrome
 * or Firefox docs; the real-browser capability spike is still pending (see the
 * "Documented limitations" section of contracts/dnr-rules.md).
 */
export const DENIED_HEADERS: readonly string[] = [];

/**
 * Documented Chrome allowlist of request headers that support the `append`
 * operation (all lowercase):
 * https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest
 *
 * Appending to any other request header produces an invalid rule — and because
 * `updateSessionRules` is atomic, one invalid rule rejects the entire update —
 * so the compiler skips such headers with a notice instead.
 */
export const APPENDABLE_REQUEST_HEADERS: readonly string[] = [
  'accept',
  'accept-encoding',
  'accept-language',
  'access-control-request-headers',
  'cache-control',
  'connection',
  'content-language',
  'cookie',
  'forwarded',
  'if-match',
  'if-none-match',
  'keep-alive',
  'range',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'user-agent',
  'via',
  'want-digest',
  'x-forwarded-for',
];
