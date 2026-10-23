import { describe, expect, it } from 'vitest';
import { csvCell, parseRange, toCsv } from '@/server/reports';

describe('parseRange', () => {
  // 18:00 UTC on 10 March is already 01:00 on the 11th in Salatiga.
  const now = new Date('2026-03-10T18:00:00Z');

  it('defaults to the last 7 shop days ending today', () => {
    const r = parseRange(undefined, undefined, now);
    expect(r.toDay).toBe('2026-03-11');
    expect(r.fromDay).toBe('2026-03-05');
  });

  it('turns days into midnight-to-midnight in UTC+7', () => {
    const r = parseRange('2026-03-10', '2026-03-10', now);
    expect(r.from.toISOString()).toBe('2026-03-09T17:00:00.000Z');
    expect(r.to.toISOString()).toBe('2026-03-10T17:00:00.000Z');
  });

  it('ignores junk and swaps a backwards range into one day', () => {
    expect(parseRange('nope', '2026-03-10', now).fromDay).toBe('2026-03-04');
    expect(parseRange('2026-03-20', '2026-03-10', now).fromDay).toBe('2026-03-10');
  });
});

describe('csv', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
  });

  it('defuses spreadsheet formulas but leaves negative numbers alone', () => {
    expect(csvCell('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell(-3000)).toBe('-3000');
  });

  it('writes dates as ISO and ends rows with CRLF', () => {
    const out = toCsv(['when', 'n'], [[new Date('2026-03-10T00:00:00Z'), 5]]);
    expect(out).toBe('when,n\r\n2026-03-10T00:00:00.000Z,5\r\n');
  });
});
