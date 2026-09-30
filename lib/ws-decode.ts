import { decode as decodeMsgpack } from '@msgpack/msgpack';
import { formatBodyForDisplay } from './body-format';
import type { WsMessage } from './types';

/** Decoded views for a WebSocket message (spec 006 FR-014 / FR-015). */
export type WsView = 'text' | 'json' | 'hex' | 'base64' | 'msgpack';

export type DecodeResult = { ok: true; text: string } | { ok: false; reason: string };

export const WS_VIEWS: { value: WsView; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'json', label: 'JSON' },
  { value: 'hex', label: 'Hex' },
  { value: 'base64', label: 'Base64' },
  { value: 'msgpack', label: 'MessagePack' },
];

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function utf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function messageBytes(msg: WsMessage): Uint8Array {
  return msg.kind === 'binary'
    ? base64ToBytes(msg.data)
    : new TextEncoder().encode(msg.data);
}

/** Text of the message: as-is for text frames, UTF-8 for binary frames. */
function messageText(msg: WsMessage): string | null {
  return msg.kind === 'text' ? msg.data : utf8(messageBytes(msg));
}

function hex(bytes: Uint8Array): string {
  const lines: string[] = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const row = [...bytes.subarray(i, i + 16)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ');
    lines.push(`${i.toString(16).padStart(8, '0')}  ${row}`);
  }
  return lines.join('\n');
}

/** Strict Base64 (standard or URL-safe, padding optional) → bytes, or null. */
function parseBase64(text: string): Uint8Array | null {
  let b64 = text.trim().replace(/-/g, '+').replace(/_/g, '/');
  if (b64.length === 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) {
    return null;
  }
  b64 = b64.replace(/=+$/, '');
  if (b64.length % 4 === 1) {
    return null;
  }
  b64 += '='.repeat((4 - (b64.length % 4)) % 4);
  try {
    return base64ToBytes(b64);
  } catch {
    return null;
  }
}

function msgpackValue(bytes: Uint8Array): { ok: true; value: unknown } | { ok: false } {
  try {
    // decode() throws on trailing bytes, so success means the whole frame parsed.
    return { ok: true, value: decodeMsgpack(bytes, { useBigInt64: true }) };
  } catch {
    return { ok: false };
  }
}

function msgpackReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return bytesToBase64(value);
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}

function isContainer(value: unknown): boolean {
  return value !== null && typeof value === 'object' && !(value instanceof Uint8Array);
}

/** JSON object/array text → JSON; other text → Text; whole map/array MessagePack → MessagePack; else Hex. */
export function autoView(msg: WsMessage): WsView {
  if (msg.kind === 'text') {
    try {
      return isContainer(JSON.parse(msg.data)) ? 'json' : 'text';
    } catch {
      return 'text';
    }
  }
  // A lone scalar is rejected: any byte 0x00–0x7f is a valid MessagePack int.
  const decoded = msgpackValue(messageBytes(msg));
  return decoded.ok && isContainer(decoded.value) ? 'msgpack' : 'hex';
}

/** Render a message in a view. Never throws. */
export function decode(msg: WsMessage, view: WsView): DecodeResult {
  try {
    switch (view) {
      case 'text': {
        const text = messageText(msg);
        return text == null
          ? { ok: false, reason: 'Cannot decode as UTF-8 text' }
          : { ok: true, text };
      }
      case 'json': {
        const text = messageText(msg);
        if (text != null) {
          try {
            JSON.parse(text);
            return { ok: true, text: formatBodyForDisplay(text) };
          } catch {
            /* fall through */
          }
        }
        return { ok: false, reason: 'Cannot decode as JSON' };
      }
      case 'hex':
        return { ok: true, text: hex(messageBytes(msg)) };
      case 'base64': {
        if (msg.kind === 'binary') {
          return { ok: true, text: msg.data };
        }
        const bytes = parseBase64(msg.data);
        if (!bytes) {
          return { ok: false, reason: 'Cannot decode as Base64' };
        }
        return { ok: true, text: utf8(bytes) ?? hex(bytes) };
      }
      case 'msgpack': {
        if (msg.kind === 'text') {
          return { ok: false, reason: 'Cannot decode as MessagePack' };
        }
        const decoded = msgpackValue(messageBytes(msg));
        return decoded.ok
          ? { ok: true, text: JSON.stringify(decoded.value, msgpackReplacer, 2) }
          : { ok: false, reason: 'Cannot decode as MessagePack' };
      }
    }
  } catch {
    return { ok: false, reason: `Cannot decode as ${view}` };
  }
}
