import { describe, expect, it } from 'vitest';
import { formatBodyForDisplay } from '~/lib/body-format';

describe('formatBodyForDisplay', () => {
  it('pretty-prints object JSON with 2-space indent', () => {
    expect(formatBodyForDisplay('{"hello":"world"}')).toBe(
      '{\n  "hello": "world"\n}',
    );
  });

  it('pretty-prints array JSON with 2-space indent', () => {
    expect(formatBodyForDisplay('[1,2]')).toBe('[\n  1,\n  2\n]');
  });

  it('returns invalid JSON unchanged', () => {
    expect(formatBodyForDisplay('{not json')).toBe('{not json');
  });

  it('returns JSON primitives unchanged', () => {
    expect(formatBodyForDisplay('"just a string"')).toBe('"just a string"');
    expect(formatBodyForDisplay('42')).toBe('42');
    expect(formatBodyForDisplay('true')).toBe('true');
    expect(formatBodyForDisplay('null')).toBe('null');
  });

  it('returns an empty string unchanged', () => {
    expect(formatBodyForDisplay('')).toBe('');
  });

  it('never throws', () => {
    expect(() => formatBodyForDisplay('{"a":1}')).not.toThrow();
    expect(() => formatBodyForDisplay(undefined as unknown as string)).not.toThrow();
  });
});
