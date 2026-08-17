import { describe, expect, it } from 'vitest';
import { captureFromWebRequestBody, captureText } from '~/lib/request-body';

describe('captureText', () => {
  it('marks empty string as empty', () => {
    expect(captureText('')).toEqual({ kind: 'empty' });
  });

  it('stores utf-8 text', () => {
    expect(captureText('hello')).toEqual({
      kind: 'text',
      text: 'hello',
      truncated: false,
    });
  });

  it('truncates over max bytes', () => {
    const captured = captureText('abcdefghij', 4);
    expect(captured.kind).toBe('text');
    expect(captured.truncated).toBe(true);
    expect(captured.text!.length).toBeGreaterThan(0);
    expect(captured.text!.length).toBeLessThan(10);
  });

  it('marks invalid utf-8 as binary', () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0xfd]).buffer;
    expect(captureText(bytes).kind).toBe('binary');
  });
});

describe('captureFromWebRequestBody', () => {
  it('returns empty when missing', () => {
    expect(captureFromWebRequestBody(undefined).kind).toBe('empty');
  });

  it('encodes formData', () => {
    const captured = captureFromWebRequestBody({
      formData: { a: ['1'], b: ['2'] },
    });
    expect(captured.kind).toBe('text');
    expect(captured.text).toContain('a=1');
    expect(captured.text).toContain('b=2');
  });

  it('decodes raw utf-8', () => {
    const bytes = new TextEncoder().encode('{"x":1}');
    const captured = captureFromWebRequestBody({
      raw: [{ bytes: bytes.buffer }],
    });
    expect(captured).toEqual({
      kind: 'text',
      text: '{"x":1}',
      truncated: false,
    });
  });
});
