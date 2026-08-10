import { describe, it, expect } from 'vitest';
import { normalizeString, findMatches, DEFAULT_MAX_MATCHES } from './searchHighlight';

// The Hungarian strings below are test data, not prose: normalizeString exists to strip
// diacritics, and Hungarian carries the double acute accents that catch naive
// implementations. Translating them would remove what is being tested.
describe('normalizeString', () => {
  it('lowercases', () => {
    expect(normalizeString('ABC')).toBe('abc');
  });

  it('strips Hungarian diacritics, including the double acute accents', () => {
    expect(normalizeString('Árvíztűrő tükörfúrógép')).toBe('arvizturo tukorfurogep');
  });

  it('strips diacritics outside the Latin block too', () => {
    expect(normalizeString('Ćwiczenie')).toBe('cwiczenie');
  });

  it('is idempotent', () => {
    const once = normalizeString('Öt szép szűzlány');
    expect(normalizeString(once)).toBe(once);
  });

  it('preserves length for ASCII input, so match offsets stay valid', () => {
    const text = 'the quick brown fox';
    expect(normalizeString(text)).toHaveLength(text.length);
  });

  it('preserves length for precomposed Latin-1 accents, so match offsets stay valid', () => {
    const text = 'árvíztűrő';
    expect(normalizeString(text)).toHaveLength(text.length);
  });
});

describe('findMatches', () => {
  it('returns an empty array for a blank query', () => {
    expect(findMatches('hello world', '')).toEqual([]);
    expect(findMatches('hello world', '   ')).toEqual([]);
  });

  it('finds every occurrence and returns offsets in ascending order', () => {
    expect(findMatches('aXbXcX', 'X')).toEqual([1, 3, 5]);
  });

  it('finds overlapping occurrences', () => {
    expect(findMatches('aaaa', 'aa')).toEqual([0, 1, 2]);
  });

  it('is case- and diacritic-insensitive', () => {
    expect(findMatches('Árvíz', 'arv')).toEqual([0]);
  });

  it('returns positions that index correctly into the original text', () => {
    const text = 'first hit, second hit';
    const positions = findMatches(text, 'HIT');
    expect(positions).toHaveLength(2);
    for (const pos of positions) {
      expect(text.slice(pos, pos + 3)).toBe('hit');
    }
  });

  it('returns an empty array when there is no match', () => {
    expect(findMatches('hello', 'zzz')).toEqual([]);
  });

  it('stops at the requested match cap', () => {
    expect(findMatches('aaaaa', 'a', 2)).toEqual([0, 1]);
  });

  it('caps at DEFAULT_MAX_MATCHES by default, bounding the work the viewer has to do', () => {
    const text = 'a'.repeat(DEFAULT_MAX_MATCHES + 500);
    expect(findMatches(text, 'a')).toHaveLength(DEFAULT_MAX_MATCHES);
  });
});
