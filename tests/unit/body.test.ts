import { describe, expect, it } from 'vitest';
import { BodyTooLargeError, readLimitedText } from '@/server/body';

const post = (body: string, headers: Record<string, string> = {}) =>
  new Request('http://localhost/x', { method: 'POST', body, headers });

describe('readLimitedText', () => {
  it('returns a body under the cap', async () => {
    expect(await readLimitedText(post('hello'), 10)).toBe('hello');
  });

  it('counts bytes, not characters', async () => {
    // Three characters, nine bytes.
    await expect(readLimitedText(post('日本語'), 8)).rejects.toBeInstanceOf(BodyTooLargeError);
    expect(await readLimitedText(post('日本語'), 9)).toBe('日本語');
  });

  it('refuses on the Content-Length header before reading', async () => {
    const request = post('tiny', { 'content-length': '999999' });
    await expect(readLimitedText(request, 100)).rejects.toBeInstanceOf(BodyTooLargeError);
  });
});
