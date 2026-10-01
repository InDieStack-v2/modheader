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

/** One WebSocket frame captured by the page hook (spec 006). */
export interface WsMessage {
  /** Per-socket sequence from the hook; ordering key. */
  seq: number;
  at: number;
  dir: 'sent' | 'received';
  kind: 'text' | 'binary';
  /** Text content, or Base64 of the bytes for `binary`. */
  data: string;
  /** Original size in bytes, before truncation. */
  size: number;
  truncated?: boolean;
}

export type WsConnectionState = 'connecting' | 'open' | 'closed' | 'failed';

/** One captured WebSocket connection (spec 006 data-model.md). */
export interface WsConnectionEntry {
  /** webRequest requestId of the handshake. */
  id: string;
  profileIndex: number;
  /** -1 when not from a tab. */
  tabId: number;
  startedAt: number;
  url: string;
  state: WsConnectionState;
  closeCode?: number;
  closeReason?: string;
  requestHeaders: NameValue[];
  responseHeaders?: NameValue[];
  /** `<tabId>:<frameId>:<socketId>` once bound to the page hook. */
  hookKey?: string;
  /** false + open/closed = messages not available (e.g. worker socket). */
  messagesObserved: boolean;
  /** Oldest first. */
  messages: WsMessage[];
  droppedMessages: boolean;
}

/** Session-only (storage.session, or local fallback wiped on startup). */
export interface RequestLogState {
  recording: boolean[];
  /** WebSocket capture switch, independent of `recording`. */
  wsRecording: boolean[];
  entries: RequestLogEntry[][];
  /** Per-profile visible types; [] = all types. */
  typeFilter: string[][];
  /** Per-profile WebSocket connections, newest first. */
  sockets: WsConnectionEntry[][];
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
  /** Header name is not a valid HTTP field-name for DNR. */
  | 'invalid-header-name'
  /** Rule count exceeded the session-rule cap; rules were truncated. */
  | 'rule-limit';

/** Rendered in the popup so degradation is user-visible (FR-008, SC-004). */
export interface UnsupportedNotice {
  header: string;
  reason: UnsupportedReason;
}
