import type { BodyCapture } from './types';

export const MAX_BODY_BYTES = 65_536;

function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return text;
  } catch {
    return null;
  }
}

export function captureText(
  source: string | ArrayBuffer,
  maxBytes: number = MAX_BODY_BYTES,
): BodyCapture {
  if (typeof source === 'string') {
    if (source.length === 0) {
      return { kind: 'empty' };
    }
    const encoded = new TextEncoder().encode(source);
    if (encoded.byteLength <= maxBytes) {
      return { kind: 'text', text: source, truncated: false };
    }
    const slice = encoded.slice(0, maxBytes);
    const text = new TextDecoder('utf-8', { fatal: false }).decode(slice);
    return { kind: 'text', text, truncated: true };
  }
  const bytes = new Uint8Array(source);
  if (bytes.byteLength === 0) {
    return { kind: 'empty' };
  }
  const truncated = bytes.byteLength > maxBytes;
  const slice = truncated ? bytes.slice(0, maxBytes) : bytes;
  const text = decodeUtf8(slice);
  if (text == null) {
    return { kind: 'binary' };
  }
  return { kind: 'text', text, truncated };
}

export function captureFromWebRequestBody(
  body:
    | {
        formData?: Record<string, unknown>;
        raw?: { bytes?: ArrayBuffer }[];
      }
    | undefined,
): BodyCapture {
  if (!body) {
    return { kind: 'empty' };
  }
  if (body.formData && Object.keys(body.formData).length > 0) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(body.formData)) {
      const values = Array.isArray(value) ? value : [value];
      for (const item of values) {
        params.append(key, String(item));
      }
    }
    return captureText(params.toString());
  }
  if (body.raw && body.raw.length > 0) {
    const parts: Uint8Array[] = [];
    for (const part of body.raw) {
      if (part.bytes) {
        parts.push(new Uint8Array(part.bytes));
      }
    }
    if (parts.length === 0) {
      return { kind: 'empty' };
    }
    const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      merged.set(part, offset);
      offset += part.byteLength;
    }
    return captureText(merged.buffer);
  }
  return { kind: 'empty' };
}
