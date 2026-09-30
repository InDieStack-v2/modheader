import { describe, expect, it } from 'vitest';
import { encode } from '@msgpack/msgpack';
import { autoView, decode } from '~/lib/ws-decode';
import type { WsMessage } from '~/lib/types';

function text(data: string): WsMessage {
  return { seq: 1, at: 1, dir: 'received', kind: 'text', data, size: data.length };
}

function bytes(values: number[] | Uint8Array): WsMessage {
  const arr = Uint8Array.from(values);
  let bin = '';
  for (const b of arr) {
    bin += String.fromCharCode(b);
  }
  return {
    seq: 1,
    at: 1,
    dir: 'received',
    kind: 'binary',
    data: btoa(bin),
    size: arr.length,
  };
}

describe('autoView', () => {
  it('picks JSON for JSON object/array text, Text otherwise', () => {
    expect(autoView(text('{"a":1}'))).toBe('json');
    expect(autoView(text('[1,2]'))).toBe('json');
    expect(autoView(text('hello'))).toBe('text');
    expect(autoView(text('42'))).toBe('text');
  });

  it('picks MessagePack only for a whole map/array, Hex otherwise', () => {
    expect(autoView(bytes(encode({ x: [1, 2] })))).toBe('msgpack');
    expect(autoView(bytes([0x05]))).toBe('hex');
    expect(autoView(bytes([0xc1, 0xff, 0x00]))).toBe('hex');
    // Valid map followed by trailing garbage is not a clean decode.
    expect(autoView(bytes([...encode({ a: 1 }), 0xc1]))).toBe('hex');
  });
});

describe('decode', () => {
  it('hex: 16 bytes per line with an 8-digit offset', () => {
    expect(decode(bytes([1, 2, 3]), 'hex')).toEqual({
      ok: true,
      text: '00000000  01 02 03',
    });
    const lines = decode(bytes(Array.from({ length: 17 }, (_, i) => i)), 'hex');
    expect(lines.ok && lines.text.split('\n')).toEqual([
      '00000000  00 01 02 03 04 05 06 07 08 09 0a 0b 0c 0d 0e 0f',
      '00000010  10',
    ]);
    expect(decode(text('hi'), 'hex')).toEqual({ ok: true, text: '00000000  68 69' });
  });

  it('base64: binary shows stored Base64; Base64 text decodes', () => {
    expect(decode(bytes(encode({ x: [1, 2] })), 'base64')).toEqual({
      ok: true,
      text: 'gaF4kgEC',
    });
    expect(decode(text('aGVsbG8='), 'base64')).toEqual({ ok: true, text: 'hello' });
    expect(decode(text('aGVsbG8'), 'base64')).toEqual({ ok: true, text: 'hello' });
    expect(decode(text('aGk_'), 'base64')).toMatchObject({ ok: true });
    expect(decode(text('hello'), 'base64')).toMatchObject({ ok: false });
    // Decoded bytes that are not UTF-8 fall back to hex.
    expect(decode(text('/w=='), 'base64')).toEqual({ ok: true, text: '00000000  ff' });
  });

  it('msgpack: pretty JSON, with bytes as Base64 and bigints as strings', () => {
    expect(decode(bytes(encode({ x: [1, 2] })), 'msgpack')).toEqual({
      ok: true,
      text: JSON.stringify({ x: [1, 2] }, null, 2),
    });
    const rich = decode(
      bytes(encode({ b: Uint8Array.from([1, 2]), n: 2n ** 60n }, { useBigInt64: true })),
      'msgpack',
    );
    expect(rich.ok && JSON.parse(rich.text)).toEqual({
      b: 'AQI=',
      n: String(2n ** 60n),
    });
    expect(decode(bytes([...encode(1), 0xc1]), 'msgpack')).toMatchObject({ ok: false });
    expect(decode(text('hello'), 'msgpack')).toMatchObject({ ok: false });
  });

  it('json and text views', () => {
    expect(decode(text('{"a":1}'), 'json')).toEqual({
      ok: true,
      text: '{\n  "a": 1\n}',
    });
    expect(decode(text('nope'), 'json')).toMatchObject({ ok: false });
    expect(decode(text('hello'), 'text')).toEqual({ ok: true, text: 'hello' });
    expect(decode(bytes([0x68, 0x69]), 'text')).toEqual({ ok: true, text: 'hi' });
    expect(decode(bytes([0xff, 0xfe]), 'text')).toMatchObject({ ok: false });
  });
});
