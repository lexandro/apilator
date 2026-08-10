import { describe, it, expect } from 'vitest';
import { buildLineStarts, findLineAt, groupMatchesByLine } from './lineIndex';
import { findMatches } from './searchHighlight';

/**
 * The implementations these replaced, kept verbatim as the reference oracle. The new
 * code must agree with them on every input; it is only allowed to be faster.
 */
function referenceLineStart(lines: string[], lineIdx: number): number {
  let pos = 0;
  for (let i = 0; i < lineIdx; i++) pos += lines[i].length + 1;
  return pos;
}

function referenceGroupMatches(lines: string[], matches: number[]): Map<number, number[]> {
  const result = new Map<number, number[]>();
  let charCount = 0;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const lineStart = charCount;
    const lineEnd = charCount + lines[lineIdx].length;
    const positions: number[] = [];

    for (let matchIdx = 0; matchIdx < matches.length; matchIdx++) {
      const matchPos = matches[matchIdx];
      if (matchPos >= lineStart && matchPos < lineEnd) positions.push(matchIdx);
    }

    if (positions.length > 0) result.set(lineIdx, positions);
    charCount = lineEnd + 1;
  }

  return result;
}

function referenceCurrentLine(lines: string[], matches: number[], currentMatch: number): number {
  if (matches.length === 0) return -1;
  let charCount = 0;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const lineEnd = charCount + lines[lineIdx].length;
    if (matches[currentMatch] >= charCount && matches[currentMatch] < lineEnd) return lineIdx;
    charCount = lineEnd + 1;
  }

  return -1;
}

/** Deterministic pseudo-random generator so a failure is always reproducible. */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function randomText(seed: number, lineCount: number): string {
  const random = makeRandom(seed);
  const words = ['alpha', 'beta', 'gamma', 'user', 'id', '', 'user_user', 'x'];
  const lines: string[] = [];

  for (let i = 0; i < lineCount; i++) {
    const wordCount = Math.floor(random() * 5);
    const parts: string[] = [];
    for (let w = 0; w < wordCount; w++) parts.push(words[Math.floor(random() * words.length)]);
    lines.push(parts.join(' '));
  }

  return lines.join('\n');
}

describe('buildLineStarts', () => {
  it('starts the first line at zero', () => {
    expect(buildLineStarts(['abc', 'de'])[0]).toBe(0);
  });

  it('accounts for the newline between lines', () => {
    expect(buildLineStarts(['abc', 'de', 'f'])).toEqual([0, 4, 7]);
  });

  it('handles empty lines', () => {
    expect(buildLineStarts(['', '', 'x'])).toEqual([0, 1, 2]);
  });

  it('returns an empty array for no lines', () => {
    expect(buildLineStarts([])).toEqual([]);
  });

  it('agrees with the reference implementation on random input', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const lines = randomText(seed, 200).split('\n');
      const starts = buildLineStarts(lines);

      for (let i = 0; i < lines.length; i++) {
        expect(starts[i]).toBe(referenceLineStart(lines, i));
      }
    }
  });

  it('indexes correctly back into the original text', () => {
    const text = 'first\nsecond\n\nfourth';
    const lines = text.split('\n');
    const starts = buildLineStarts(lines);

    for (let i = 0; i < lines.length; i++) {
      expect(text.slice(starts[i], starts[i] + lines[i].length)).toBe(lines[i]);
    }
  });
});

describe('findLineAt', () => {
  const lines = ['abc', 'de', '', 'fghi'];
  const starts = buildLineStarts(lines);

  it('finds the line containing a position', () => {
    expect(findLineAt(starts, 0)).toBe(0);
    expect(findLineAt(starts, 2)).toBe(0);
    expect(findLineAt(starts, 4)).toBe(1);
    expect(findLineAt(starts, 7)).toBe(2);
    expect(findLineAt(starts, 8)).toBe(3);
  });

  it('returns -1 for a negative position', () => {
    expect(findLineAt(starts, -1)).toBe(-1);
  });

  it('returns -1 when there are no lines', () => {
    expect(findLineAt([], 0)).toBe(-1);
  });

  it('clamps to the last line for a position past the end', () => {
    expect(findLineAt(starts, 9999)).toBe(lines.length - 1);
  });
});

describe('groupMatchesByLine', () => {
  function group(text: string, query: string) {
    const lines = text.split('\n');
    const matches = findMatches(text, query);
    return {
      actual: groupMatchesByLine(lines, buildLineStarts(lines), matches),
      expected: referenceGroupMatches(lines, matches),
      matches,
      lines,
    };
  }

  it('returns an empty map when there are no matches', () => {
    expect(groupMatchesByLine(['abc'], [0], [])).toEqual(new Map());
  });

  it('groups matches onto their line', () => {
    const { actual } = group('user one\nnobody\nuser two', 'user');
    expect(actual).toEqual(
      new Map([
        [0, [0]],
        [2, [1]],
      ])
    );
  });

  it('handles several matches on the same line', () => {
    const { actual } = group('user user user\nnope', 'user');
    expect(actual.get(0)).toEqual([0, 1, 2]);
  });

  it('agrees with the reference implementation on random input', () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (const query of ['user', 'a', 'alpha', 'zz']) {
        const { actual, expected } = group(randomText(seed, 300), query);
        expect(actual, `seed ${seed}, query "${query}"`).toEqual(expected);
      }
    }
  });

  // Boundary cases the random corpus cannot reach: it only ever produces matches that
  // start on a printable character, so nothing exercises the newline positions. Mutation
  // testing showed an off-by-one on the line end and a dropped newline guard both slipped
  // through without these.
  it('assigns a match that starts on a newline to no line at all', () => {
    const { actual, expected, matches } = group('ab\ncd', '\nc');

    expect(matches).toEqual([2]);
    expect(actual).toEqual(new Map());
    expect(actual).toEqual(expected);
  });

  it('assigns a match spanning a line break to the line it starts on', () => {
    const { actual, expected, matches } = group('ab\ncd', 'b\nc');

    expect(matches).toEqual([1]);
    expect(actual).toEqual(new Map([[0, [0]]]));
    expect(actual).toEqual(expected);
  });

  it('keeps a match ending exactly at the line end on that line', () => {
    const { actual, expected } = group('xxab\ncd', 'ab');

    expect(actual).toEqual(new Map([[0, [0]]]));
    expect(actual).toEqual(expected);
  });

  it('keeps a match starting exactly at the line start on that line', () => {
    const { actual, expected } = group('zz\nabxx', 'ab');

    expect(actual).toEqual(new Map([[1, [0]]]));
    expect(actual).toEqual(expected);
  });

  it('handles consecutive newline-starting matches without stalling', () => {
    const { actual, expected } = group('a\n\n\nb', '\n');

    expect(actual).toEqual(expected);
  });

  it('agrees with the reference when every line matches', () => {
    const text = Array.from({ length: 100 }, () => 'user').join('\n');
    const { actual, expected } = group(text, 'user');
    expect(actual).toEqual(expected);
  });

  it('agrees with the reference on text of only empty lines', () => {
    const { actual, expected } = group('\n\n\n\n', 'x');
    expect(actual).toEqual(expected);
  });
});

describe('current match line', () => {
  it('agrees with the reference implementation on random input', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const text = randomText(seed, 300);
      const lines = text.split('\n');
      const starts = buildLineStarts(lines);
      const matches = findMatches(text, 'user');

      for (let current = 0; current < matches.length; current++) {
        expect(findLineAt(starts, matches[current]), `seed ${seed}, match ${current}`).toBe(
          referenceCurrentLine(lines, matches, current)
        );
      }
    }
  });
});
