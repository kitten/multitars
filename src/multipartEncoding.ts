export let BOUNDARY_ID = '----formdata-';
for (let i = 16; i > 0; i--) {
  BOUNDARY_ID += ((Math.random() * 1e8) | 0).toString(36)[0];
}

const pencode = (c: string) => {
  switch (c) {
    case '\\':
      // Chrome doesn't escape '\', but this awkwardly means that the '\' will be evaluated as
      // an escape sequence on the other end. That seems like a bug. Let's not copy bugs.
      return '\\\\';
    case '"':
      // Firefox supposedly escapes this as '\"', but Chrome chooses to use percent escapes,
      // probably for fear of a buggy receiver who interprets the '"' as being the end of the
      // string. There is no standard.
      return '%22';
    case '\n':
      return '%0A';
    default:
      // In case we expand the pattern, handle all other characters
      return `%${c.charCodeAt(0).toString(16).toUpperCase()}`;
  }
};

const ENCODE_NAME_CHARS = /["\n\\]/g;

/** Encode a multipart name/filename (quotes must be added manually)
 * @remarks
 * This mirrors workerd's multipart encoding. There isn't really a standard
 * for this. However, full URL encoding or RFC3986 aren't properly decoded
 * in Cloudflare.
 * @see https://github.com/cloudflare/workerd/blob/e1c61b8/src/workerd/api/form-data.c%2B%2B#L213-L242
 */
export function encodeName(input: string): string {
  return input.replace(ENCODE_NAME_CHARS, pencode);
}

const DECODE_ESCAPE_CHARS = /\\(?:u[0-9a-f]{4}|x[0-9a-f]{2}|.)/gi;
const DECODE_PENCODED = /%[0-9a-f]{2}/gi;

const decodeBackslashEscape = (seq: string) => {
  if (seq[0] !== '\\') return seq;
  switch (seq[1]) {
    case 'u':
    case 'x':
      const hex = seq.slice(2);
      return hex.length > 1 ? String.fromCharCode(parseInt(hex, 16)) : seq;
    case 'b':
      return '\b';
    case 'f':
      return '\f';
    case 'n':
      return '\n';
    case 'r':
      return '\r';
    case 't':
      return '\t';
    default:
      // Return the escaped character directly
      return seq[2] != null ? seq[2] : seq;
  }
};

const pdecode = (c: string) =>
  String.fromCharCode(parseInt(c[0] === '%' ? c.slice(1) : c, 16));

export function decodeName(encoded: string): string {
  return encoded
    .replace(DECODE_ESCAPE_CHARS, decodeBackslashEscape)
    .replace(DECODE_PENCODED, pdecode);
}
