import { describe, it, expect } from 'vitest';
import type { KeyValuePair } from '../domain';
import {
  detectContentType,
  formatJson,
  formatXml,
  toHex,
  toBase64,
  formatBody,
  base64ToBytes,
} from './formatters';

function header(key: string, value: string): KeyValuePair {
  return { id: 'test-id', key, value, enabled: true };
}

describe('detectContentType', () => {
  it('falls back to raw when there is no Content-Type header', () => {
    expect(detectContentType([])).toBe('raw');
  });

  it('matches the header name case-insensitively', () => {
    expect(detectContentType([header('CONTENT-TYPE', 'application/json')])).toBe('json');
    expect(detectContentType([header('content-type', 'application/json')])).toBe('json');
  });

  it('ignores charset and other parameters', () => {
    expect(detectContentType([header('Content-Type', 'application/json; charset=utf-8')])).toBe(
      'json'
    );
  });

  it('recognises +json and +xml suffixed media types', () => {
    expect(detectContentType([header('Content-Type', 'application/vnd.api+json')])).toBe('json');
    expect(detectContentType([header('Content-Type', 'application/atom+xml')])).toBe('xml');
  });

  it('recognises text/xml as xml and text/html as html', () => {
    expect(detectContentType([header('Content-Type', 'text/xml')])).toBe('xml');
    expect(detectContentType([header('Content-Type', 'text/html')])).toBe('html');
  });

  it('recognises both javascript and ecmascript', () => {
    expect(detectContentType([header('Content-Type', 'application/javascript')])).toBe('javascript');
    expect(detectContentType([header('Content-Type', 'text/ecmascript')])).toBe('javascript');
  });

  it('falls back to raw for unknown media types', () => {
    expect(detectContentType([header('Content-Type', 'image/png')])).toBe('raw');
  });
});

describe('formatJson', () => {
  it('pretty-prints with two-space indentation', () => {
    expect(formatJson('{"a":1}')).toBe('{\n  "a": 1\n}');
  });

  it('returns the input unchanged when it is not valid JSON', () => {
    expect(formatJson('not json at all')).toBe('not json at all');
  });

  it('does not throw on an empty string', () => {
    expect(formatJson('')).toBe('');
  });
});

describe('formatXml', () => {
  it('puts each element on its own line and indents children', () => {
    expect(formatXml('<a><b>x</b></a>')).toBe('<a>\n  <b>x</b>\n</a>');
  });

  it('does not indent after a self-closing tag', () => {
    expect(formatXml('<a><b/><c/></a>')).toBe('<a>\n  <b/>\n  <c/>\n</a>');
  });

  it('does not indent after the XML declaration', () => {
    expect(formatXml('<?xml version="1.0"?><a>x</a>')).toBe('<?xml version="1.0"?>\n<a>x</a>');
  });

  it('never produces a negative indent for unbalanced input', () => {
    const out = formatXml('</a></b>');
    expect(out).not.toContain('  </a>');
  });
});

describe('toHex', () => {
  it('renders bytes as lowercase two-digit hex', () => {
    expect(toHex('Hi').startsWith('48 69 ')).toBe(true);
  });

  it('appends the printable-ASCII column', () => {
    expect(toHex('Hi').endsWith('  Hi')).toBe(true);
  });

  it('replaces non-printable bytes with a dot in the ASCII column', () => {
    expect(toHex('\x00').endsWith('  .')).toBe(true);
  });

  // Test data, not prose: 'a' with an acute accent is two bytes in UTF-8, which is the point.
  it('encodes multi-byte UTF-8 characters as their real bytes', () => {
    expect(toHex('á').startsWith('c3 a1 ')).toBe(true);
  });

  it('returns a stable result for an empty string', () => {
    expect(() => toHex('')).not.toThrow();
  });
});

describe('toBase64', () => {
  it('encodes ASCII', () => {
    expect(toBase64('hello')).toBe('aGVsbG8=');
  });

  it('encodes non-ASCII via UTF-8 bytes rather than throwing', () => {
    expect(toBase64('á')).toBe('w6E=');
  });

  it('encodes the empty string as the empty string', () => {
    expect(toBase64('')).toBe('');
  });
});

describe('formatBody', () => {
  it('dispatches to the matching formatter', () => {
    expect(formatBody('{"a":1}', 'json')).toBe('{\n  "a": 1\n}');
    expect(formatBody('<a><b>x</b></a>', 'xml')).toBe('<a>\n  <b>x</b>\n</a>');
    expect(formatBody('hello', 'base64')).toBe('aGVsbG8=');
  });

  it('returns the text untouched for raw and javascript', () => {
    expect(formatBody('  spacing  kept  ', 'raw')).toBe('  spacing  kept  ');
    expect(formatBody('const a=1', 'javascript')).toBe('const a=1');
  });

  it('treats html the same as xml', () => {
    expect(formatBody('<div><p>x</p></div>', 'html')).toBe(formatBody('<div><p>x</p></div>', 'xml'));
  });
});


// ============================================================
// Binary responses (B11)
// ============================================================

describe('base64ToBytes', () => {
  it('decodes base64 back to the original bytes', () => {
    expect(Array.from(base64ToBytes('iVBORw0KGgo='))).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
  });

  it('returns nothing for input that is not base64', () => {
    expect(base64ToBytes('!!! not base64 !!!')).toHaveLength(0);
  });

  it('tolerates surrounding whitespace', () => {
    expect(Array.from(base64ToBytes('  aGk=  '))).toEqual([0x68, 0x69]);
  });
});

describe('toHex accepts raw bytes', () => {
  it('renders a byte array directly', () => {
    expect(toHex(new Uint8Array([0x00, 0xff])).startsWith('00 ff ')).toBe(true);
  });
});

describe('formatBody with a binary payload', () => {
  // The PNG magic number, which is not valid UTF-8, so the backend sends it base64.
  const pngHeader = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const base64 = 'iVBORw0KGgo=';

  it('hexes the real bytes, not the base64 text', () => {
    const hex = formatBody(base64, 'hex', 'base64');
    const expected = pngHeader.map((b) => b.toString(16).padStart(2, '0')).join(' ');

    expect(hex.startsWith(expected)).toBe(true);
  });

  it('does not hex the base64 characters', () => {
    // 'i' is 0x69; hexing the base64 text would start with that.
    expect(formatBody(base64, 'hex', 'base64').startsWith('69 ')).toBe(false);
  });

  it('shows the base64 payload unchanged in the base64 view', () => {
    expect(formatBody(base64, 'base64', 'base64')).toBe(base64);
  });

  it('does not try to pretty-print a binary payload as JSON', () => {
    expect(formatBody(base64, 'json', 'base64')).toBe(base64);
  });

  it('leaves the utf8 path untouched', () => {
    expect(formatBody('{"a":1}', 'json', 'utf8')).toBe('{\n  "a": 1\n}');
    expect(formatBody('Hi', 'hex', 'utf8').startsWith('48 69 ')).toBe(true);
  });

  it('defaults to the utf8 path when no encoding is given', () => {
    expect(formatBody('Hi', 'hex')).toBe(formatBody('Hi', 'hex', 'utf8'));
  });
});
