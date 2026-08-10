import type { KeyValuePair } from '../domain';

export type FormatType = 'json' | 'xml' | 'html' | 'javascript' | 'raw' | 'hex' | 'base64';

export function detectContentType(headers: KeyValuePair[]): FormatType {
  const contentType = headers.find(
    (h) => h.key.toLowerCase() === 'content-type'
  )?.value.toLowerCase() ?? '';

  if (contentType.includes('application/json') || contentType.includes('+json')) {
    return 'json';
  }
  if (contentType.includes('application/xml') || contentType.includes('+xml') || contentType.includes('text/xml')) {
    return 'xml';
  }
  if (contentType.includes('text/html')) {
    return 'html';
  }
  if (contentType.includes('javascript') || contentType.includes('ecmascript')) {
    return 'javascript';
  }
  return 'raw';
}

export function formatJson(text: string): string {
  try {
    const parsed = JSON.parse(text);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return text;
  }
}

export function formatXml(text: string): string {
  try {
    let formatted = '';
    let indent = 0;
    const lines = text.replace(/>\s*</g, '>\n<').split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('</')) {
        indent = Math.max(0, indent - 1);
      }

      formatted += '  '.repeat(indent) + trimmed + '\n';

      if (trimmed.startsWith('<') && !trimmed.startsWith('</') && !trimmed.startsWith('<?') &&
          !trimmed.endsWith('/>') && !trimmed.includes('</')) {
        indent++;
      }
    }

    return formatted.trim();
  } catch {
    return text;
  }
}

export function formatJavaScript(text: string): string {
  // Basic JS formatting - just return as-is for now
  // Could add prettier-like formatting later
  return text;
}

/**
 * Hex and base64 rewrite the whole payload, so they are bounded rather than left to scale
 * with the response. Two megabytes costs ~125 ms; without a cap a 6 MB body froze the UI
 * for seconds.
 */
export const MAX_TRANSFORM_BYTES = 2 * 1024 * 1024;

const HEX_BYTE = Array.from({ length: 256 }, (_, b) => b.toString(16).padStart(2, '0'));
const ASCII_BYTE = Array.from({ length: 256 }, (_, b) =>
  b >= 32 && b <= 126 ? String.fromCharCode(b) : '.'
);

const BYTES_PER_ROW = 16;
const HEX_COLUMN_WIDTH = BYTES_PER_ROW * 3 + 1;

function truncationNotice(shown: number, total: number): string {
  const shownMb = (shown / (1024 * 1024)).toFixed(1);
  const totalMb = (total / (1024 * 1024)).toFixed(1);
  return `\n\n[truncated: showing the first ${shownMb} MB of ${totalMb} MB]`;
}

/** Decodes base64 into the bytes it represents, tolerating a malformed tail. */
export function base64ToBytes(base64: string): Uint8Array {
  try {
    const binary = atob(base64.trim());
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return new Uint8Array();
  }
}

export function toHex(input: string | Uint8Array, maxBytes = MAX_TRANSFORM_BYTES): string {
  const all = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const bytes = all.length > maxBytes ? all.subarray(0, maxBytes) : all;

  const rows: string[] = [];

  for (let offset = 0; offset < bytes.length; offset += BYTES_PER_ROW) {
    const end = Math.min(offset + BYTES_PER_ROW, bytes.length);
    let hex = '';
    let ascii = '';

    for (let i = offset; i < end; i++) {
      if (i > offset && (i - offset) % 8 === 0) {
        hex += ' ';
        ascii += ' ';
      }
      hex += HEX_BYTE[bytes[i]] + ' ';
      ascii += ASCII_BYTE[bytes[i]];
    }

    rows.push(hex.padEnd(HEX_COLUMN_WIDTH) + ' ' + ascii);
  }

  const result = rows.join('\n');
  return all.length > maxBytes ? result + truncationNotice(maxBytes, all.length) : result;
}

export function toBase64(text: string, maxBytes = MAX_TRANSFORM_BYTES): string {
  const all = new TextEncoder().encode(text);
  const bytes = all.length > maxBytes ? all.subarray(0, maxBytes) : all;

  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
  }

  const encoded = btoa(binary);
  return all.length > maxBytes ? encoded + truncationNotice(maxBytes, all.length) : encoded;
}

/**
  * `encoding` says what `text` holds. For a binary response it is base64 of the raw bytes,
  * so hex has to decode it first - hexing the base64 text would show the wrong bytes.
  */
export function formatBody(
  text: string,
  format: FormatType,
  encoding: 'utf8' | 'base64' = 'utf8'
): string {
  if (encoding === 'base64') {
    switch (format) {
      case 'hex':
        return toHex(base64ToBytes(text));
      case 'base64':
        return text;
      default:
        return text;
    }
  }

  switch (format) {
    case 'json':
      return formatJson(text);
    case 'xml':
    case 'html':
      return formatXml(text);
    case 'javascript':
      return formatJavaScript(text);
    case 'hex':
      return toHex(text);
    case 'base64':
      return toBase64(text);
    case 'raw':
    default:
      return text;
  }
}

export const FORMAT_OPTIONS: { value: FormatType; label: string; icon: string }[] = [
  { value: 'json', label: 'JSON', icon: '{}' },
  { value: 'xml', label: 'XML', icon: '⟨/⟩' },
  { value: 'html', label: 'HTML', icon: '</>' },
  { value: 'javascript', label: 'JavaScript', icon: 'JS' },
  { value: 'raw', label: 'Raw', icon: '☰' },
  { value: 'hex', label: 'Hex', icon: '0x' },
  { value: 'base64', label: 'Base64', icon: '64' },
];
