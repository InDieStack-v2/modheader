import { describe, expect, it } from 'vitest';
import { toCurl } from '~/lib/curl';
import type { RequestLogEntry } from '~/lib/types';

const base: RequestLogEntry = {
  id: '1',
  profileIndex: 0,
  startedAt: 0,
  method: 'post',
  url: 'https://api.example.com/v1?q=1',
  resourceType: 'xmlhttprequest',
  status: 200,
  requestHeaders: [
    { name: 'Authorization', value: 'Bearer secret' },
    { name: 'Cookie', value: 'sid=abc' },
    { name: 'X-Test', value: '1' },
  ],
};

describe('toCurl', () => {
  it('includes method, url, real header values, and text body', () => {
    const { command, bodyOmitted } = toCurl({
      ...base,
      requestBody: { kind: 'text', text: '{"a":1}', truncated: false },
    });
    expect(bodyOmitted).toBe(false);
    expect(command).toContain("-X POST");
    expect(command).toContain("'https://api.example.com/v1?q=1'");
    expect(command).toContain('Authorization: Bearer secret');
    expect(command).toContain('Cookie: sid=abc');
    expect(command).toContain("--data-raw '{\"a\":1}'");
    expect(command).not.toContain('response');
  });

  it('omits binary body', () => {
    const { command, bodyOmitted } = toCurl({
      ...base,
      requestBody: { kind: 'binary' },
    });
    expect(bodyOmitted).toBe(true);
    expect(command).not.toContain('--data-raw');
  });
});
