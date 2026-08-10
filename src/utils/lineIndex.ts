/**
 * Character offset of the first character of each line, assuming lines were produced by
 * splitting on a single '\n'. Built once per body so a lookup is O(1) instead of the
 * O(lineIdx) scan the viewer used to run for every rendered row.
 */
export function buildLineStarts(lines: string[]): number[] {
  const starts = new Array<number>(lines.length);
  let pos = 0;

  for (let i = 0; i < lines.length; i++) {
    starts[i] = pos;
    pos += lines[i].length + 1;
  }

  return starts;
}

/** Index of the line containing `position`, or -1 if it is out of range. */
export function findLineAt(lineStarts: number[], position: number): number {
  if (lineStarts.length === 0 || position < 0) return -1;

  let low = 0;
  let high = lineStarts.length - 1;

  while (low <= high) {
    const mid = (low + high) >>> 1;
    if (lineStarts[mid] <= position) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return high;
}

/**
 * Groups match offsets by line. Both inputs are ordered, so this walks each exactly once
 * rather than testing every match against every line.
 */
export function groupMatchesByLine(
  lines: string[],
  lineStarts: number[],
  matches: number[]
): Map<number, number[]> {
  const result = new Map<number, number[]>();
  if (matches.length === 0) return result;

  let matchIdx = 0;

  for (let lineIdx = 0; lineIdx < lines.length && matchIdx < matches.length; lineIdx++) {
    const lineStart = lineStarts[lineIdx];
    const lineEnd = lineStart + lines[lineIdx].length;

    let positions: number[] | undefined;

    while (matchIdx < matches.length && matches[matchIdx] < lineEnd) {
      // A match landing exactly on a newline belongs to no line; skip it without
      // stalling the pointer.
      if (matches[matchIdx] >= lineStart) {
        (positions ??= []).push(matchIdx);
      }
      matchIdx++;
    }

    if (positions) result.set(lineIdx, positions);
  }

  return result;
}
