/**
 * Shared model types per specs/001-modernize-react-migration/data-model.md.
 * Field names preserve the legacy format so old data parses unchanged (FR-004).
 */

/** `''` = override; response-header append degrades per research D4. */
export type AppendMode = '' | 'comma' | 'append';

export interface HeaderRule {
  enabled: boolean;
  name: string;
  /** May be empty string (= header removal semantics via DNR `remove`). */
  value: string;
  /** Display only. */
  comment?: string;
}

export interface UrlFilter {
  enabled: boolean;
  type: 'urls';
  /** RE2-compatible pattern required for DNR `regexFilter`. */
  urlRegex: string;
  /** Legacy wildcard form; compiled to `urlRegex` on load, then dropped. */
  urlPattern?: string;
}

export interface TypeFilter {
  enabled: boolean;
  type: 'types';
  /** DNR resource types. */
  resourceType: string[];
}

export type Filter = UrlFilter | TypeFilter;

export interface Profile {
  /** Unique per profile list; auto-named `Profile N` on create. */
  title: string;
  /** Request headers. */
  headers: HeaderRule[];
  /** Response headers. */
  respHeaders: HeaderRule[];
  /** May be empty (= applies everywhere). */
  filters: Filter[];
  appendMode: AppendMode;
  /** UI preference, default `true`. */
  hideComment?: boolean;
}

export interface NameValue {
  name: string;
  value: string;
}

export type BodyKind = 'text' | 'binary' | 'empty' | 'unavailable';

export interface BodyCapture {
  kind: BodyKind;
  text?: string;
  truncated?: boolean;
}

export interface RequestLogEntry {
  id: string;
  profileIndex: number;
  startedAt: number;
  method: string;
  url: string;
  resourceType: string;
  status: 'pending' | number | 'failed';
  requestHeaders: NameValue[];
  responseHeaders?: NameValue[];
  requestBody?: BodyCapture;
  responseBody?: BodyCapture;
}

/** Session-only (storage.session, or local fallback wiped on startup). */
export interface RequestLogState {
  recording: boolean[];
  entries: RequestLogEntry[][];
  /** Per-profile visible types; [] = all types. */
  typeFilter: string[][];
}

/** Keys of chrome.storage.local (see data-model.md "RuntimeState"). */
export interface RuntimeState {
  profiles: Profile[];
  selectedProfileIndex: number;
  /** Absent = not paused. */
  isPaused?: boolean;
  /** Absent = all tabs. */
  lockedTabId?: number;
  /** Best-effort, from the `tabs` API. */
  activeTabUrl?: string;
  /** Set after legacy localStorage migration. */
  migrationDone?: boolean;
}

/** Metadata item stored at `backup:<ts>:meta` for chunked snapshots (storage.sync). */
export interface CloudBackup {
  chunks: number;
  createdAt: string;
}

export type UnsupportedReason =
  | 'response-append'
  | 'non-re2-filter'
  | 'denied-header'
  /** Rule count exceeded the session-rule cap; rules were truncated. */
  | 'rule-limit';

/** Rendered in the popup so degradation is user-visible (FR-008, SC-004). */
export interface UnsupportedNotice {
  header: string;
  reason: UnsupportedReason;
}
