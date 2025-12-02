const CRLF = '\r\n';
const BOUNDARY_HYPHEN_CHARS = '--';
const BOUNDARY_ID = '----formdata-eas-cli';
const FORM_FOOTER = `${BOUNDARY_HYPHEN_CHARS}${BOUNDARY_ID}${BOUNDARY_HYPHEN_CHARS}${CRLF}${CRLF}`;

const encodeName = (input: string): string => {
  return input.replace(/["\n\\]/g, (c: string) => {
    switch (c) {
      case '\\':
        return '\\\\';
      case '"':
        return '%22';
      case '\n':
        return '%0A';
      default:
        return `%${c.charCodeAt(0).toString(16).toUpperCase()}`;
    }
  });
};

const makeFormHeader = (params: {
  name: string;
  contentType: string | null;
  contentLength: number | null;
}): string => {
  const name = encodeName(params.name);
  let header = BOUNDARY_HYPHEN_CHARS + BOUNDARY_ID + CRLF;
  header += `Content-Disposition: form-data; name="${name}"; filename="${name}"`;
  if (params.contentType) {
    header += `${CRLF}Content-Type: ${params.contentType}`;
  }
  if (params.contentLength) {
    header += `${CRLF}Content-Length: ${params.contentLength}`;
  }
  header += CRLF;
  header += CRLF;
  return header;
};

export interface MultipartFileEntry {
  sha512: string;
  path: string;
  type: string | null;
  size: number;
}

export const multipartContentType = `multipart/form-data; boundary=${BOUNDARY_ID}`;

export async function* createMultipartBodyFromFilesAsync(
  entries: File[]
): AsyncGenerator<Uint8Array> {
  const encoder = new TextEncoder();
  for (let idx = 0; idx < entries.length; idx++) {
    const entry = entries[idx];
    const header = makeFormHeader({
      name: entry.name,
      contentType: entry.type,
      contentLength: entry.size,
    });
    yield encoder.encode(header);
    yield await entry.bytes();
    yield encoder.encode(CRLF);
  }
  yield encoder.encode(FORM_FOOTER);
}
