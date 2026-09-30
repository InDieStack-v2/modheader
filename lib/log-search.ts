import type { NameValue, RequestLogEntry, WsConnectionEntry } from './types';

const hay = (parts: (string | undefined)[]) =>
  parts.filter(Boolean).join('\n').toLowerCase();

const headers = (h?: NameValue[]) => (h ?? []).map((x) => `${x.name}: ${x.value}`);

/** Case-insensitive substring match; empty query matches everything. */
export function matchesRequest(e: RequestLogEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  return (
    !q ||
    hay([
      e.method,
      e.url,
      e.resourceType,
      String(e.status),
      ...headers(e.requestHeaders),
      ...headers(e.responseHeaders),
      e.requestBody?.text,
      e.responseBody?.text,
    ]).includes(q)
  );
}

export function matchesSocket(c: WsConnectionEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  return (
    !q ||
    hay([
      c.url,
      c.state,
      c.closeReason,
      ...headers(c.requestHeaders),
      ...headers(c.responseHeaders),
      // binary frames are Base64; not searchable
      ...c.messages.map((m) => (m.kind === 'text' ? m.data : undefined)),
    ]).includes(q)
  );
}
