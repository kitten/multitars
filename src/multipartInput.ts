import { StreamFile } from './file';
import { ReadableStreamBlockReader, readUntilBoundary } from './reader';
import { decodeName } from './multipartEncoding';

const BLOCK_SIZE = 4_096; /*4KiB*/

const CRLF = new Uint8Array([13, 10]);
const MAX_PREAMBLE_SIZE = 16_000; /*16kB*/
const MAX_HEADER_SIZE = 16_000; /*16kB*/
const MAX_HEADERS_SIZE = 32_000; /*32kB*/
const boundaryHeaderRe = /boundary="?([^=";]+)"?/i;
const encoder = new TextEncoder();

function utf8Encode(
  content: string | ArrayBufferView | ArrayBufferLike
): Uint8Array {
  return typeof content === 'string'
    ? encoder.encode(content)
    : new Uint8Array('buffer' in content ? content.buffer : content);
}

function toKnownHeader(headerName: string) {
  const normalized = headerName.toLowerCase().trim();
  switch (normalized) {
    case 'content-length':
      return 'Content-Length';
    case 'content-type':
      return 'Content-Type';
    case 'content-disposition':
      return 'Content-Disposition';
    default:
      return null;
  }
}

function parseContentLength(contentLength: string | undefined): number | null {
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    return Number.isSafeInteger(size) && size > 0 ? size : null;
  } else {
    return null;
  }
}

interface ContentDisposition {
  name: string | null;
  filename: string | null;
}

function parseContentDisposition(
  contentDisposition: string | undefined
): ContentDisposition | null {
  let startIdx = 0,
    endIdx = -1;
  if (
    !contentDisposition ||
    (startIdx = contentDisposition.indexOf(';')) < 0 ||
    contentDisposition.slice(0, startIdx).trimEnd() !== 'form-data'
  ) {
    return null;
  }
  const disposition: ContentDisposition = { name: null, filename: null };
  do {
    endIdx = contentDisposition.indexOf(';', startIdx);
    const entry = contentDisposition.slice(
      startIdx,
      endIdx > -1 ? endIdx : undefined
    );
    startIdx = endIdx + 1;
    const equalIdx = entry.indexOf('=');
    if (equalIdx > -1) {
      const key = entry.slice(0, equalIdx).trim();
      let value = entry.slice(equalIdx + 1).trim();
      if (key !== 'name' && key !== 'filename') {
        // NOTE: We don't handle the special `filename*=UTF-8` case
        continue;
      } else if (value[0] === '"' && value[value.length - 1] === '"') {
        disposition[key] = decodeName(value.slice(1, -1));
      } else {
        disposition[key] = decodeName(value);
      }
    }
  } while (endIdx > 0);
  return disposition;
}

interface Boundary {
  /** Initial boundary at the beginning of the multipart stream after the preamble */
  raw: Uint8Array;
  /** Trailer boundary after every multipart part.
   * @remarks
   * After every multipart part that isn't the initial one we expect a leading CRLF sequence
   */
  trailer: Uint8Array;
}

/** Create boundary patterns from `contentType` boundary parameter.
 * @remarks
 * - The leading boundary is `--${boundary}\r\n` followed by the first set of headers (leading CRLF is optional)
 * - Subsequent boundary trailers are `\r\n--${boundary}\r\n` followed by headers
 * - The closing boundary is `\r\n--${boundary}--\r\n`
 * Because of the variability of `--` or `\r\n` following the main boundary, we don't add it
 * to the pattern. Instead, we handle `--` in `decodeHeaders`.
 * We have two patterns because the leading CRLF is optional in the first boundary. Afterwards,
 * we use `Boundary.trailer` to include the leading CRLF to remove it from content parts.
 */
function convertToBoundaryBytes(contentType: string): Boundary {
  const boundaryHeader = contentType.match(boundaryHeaderRe);
  const boundaryRaw = `--${boundaryHeader?.[1] || '-'}`;
  const boundaryTrailer = `\r\n${boundaryRaw}`;
  return {
    raw: utf8Encode(boundaryRaw),
    trailer: utf8Encode(boundaryTrailer),
  };
}

async function expectPreamble(
  reader: ReadableStreamBlockReader,
  boundary: Boundary
): Promise<void> {
  let byteLength = 0;
  for await (const chunk of readUntilBoundary(reader, boundary.raw)) {
    if (chunk == null) {
      throw new Error('Invalid Multipart Preamble: Unexpected EOF');
    } else if ((byteLength += chunk?.byteLength) > MAX_PREAMBLE_SIZE) {
      throw new Error(
        'Invalid Multipart Preamble: Boundary not found within the first 16kB'
      );
    }
  }
}

async function expectTrailer(
  reader: ReadableStreamBlockReader,
  boundary: Boundary
): Promise<void> {
  for await (const chunk of readUntilBoundary(reader, boundary.trailer)) {
    if (chunk == null || chunk.byteLength !== 0) {
      throw new Error('Invalid Multipart Part: Expected trailing boundary');
    } else {
      break;
    }
  }
}

interface MultipartHeaders {
  'Content-Length'?: string;
  'Content-Type'?: string;
  'Content-Disposition'?: string;
}

async function decodeHeaders(
  reader: ReadableStreamBlockReader
): Promise<MultipartHeaders | null> {
  // NOTE: The characters we're decoding in headers is restricted, and we're therefore
  // more strict here. The `stream` option is also omitted below
  let byteLength = 0;
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  const headers: MultipartHeaders = {};
  while (byteLength < MAX_HEADERS_SIZE) {
    let header = '';
    for await (const chunk of readUntilBoundary(reader, CRLF)) {
      if (chunk == null) {
        throw new Error('Invalid Multipart Headers: Unexpected EOF');
      } else if (
        !byteLength &&
        !header &&
        chunk[0] === 45 /*'-'*/ &&
        chunk[1] === 45 /*'-'*/
      ) {
        // If the first chunk we receive here is `--`, this is the multipart data's closing delimiter
        // This means the multipart stream has ended
        return null;
      } else {
        header += decoder.decode(chunk);
        if (header.length > MAX_HEADER_SIZE)
          throw new Error(
            'Invalid Multipart Headers: A header exceeded its maximum length of 16kB'
          );
      }
    }

    if (header) {
      const colonIdx = header.indexOf(':');
      if (colonIdx > -1) {
        const headerName = toKnownHeader(header.slice(0, colonIdx));
        if (headerName) headers[headerName] = header.slice(colonIdx + 1).trim();
        byteLength += header.length + CRLF.byteLength;
      } else {
        throw new Error(
          'Invalid Multipart Headers: Invalid header value missing `:`'
        );
      }
    } else if (byteLength > 0) {
      // The first and last CRLF sections are expected to be empty (headerByteLength === 0)
      // since headers start and end with an additional CRLF sequence
      // Hence, if we have already seen some header bytes (byteLenght > 0) we stop decoding headers
      break;
    }
  }
  if (byteLength > MAX_HEADER_SIZE) {
    throw new Error(
      'Invalid Multipart Headers: Headers exceeded their maximum length of 32kB'
    );
  }
  return headers;
}

// NOTE(@kitten): We don't really want to copy but something isn't applying backpressure correctly
function copyUint8Array(src: Uint8Array) {
  const dst = new Uint8Array(src.byteLength);
  dst.set(src);
  return dst;
}

interface ParseMultipartParams {
  /** The `Content-Type` header value */
  contentType: string;
}

/** Provide tar entry iterator */
export async function* parseMultipart(
  stream: ReadableStream,
  params: ParseMultipartParams
): AsyncGenerator<StreamFile> {
  const boundary = convertToBoundaryBytes(params.contentType);
  const reader = new ReadableStreamBlockReader(stream, BLOCK_SIZE);
  const streamParams = new ByteLengthQueuingStrategy({ highWaterMark: 0 });

  await expectPreamble(reader, boundary);

  let headers: MultipartHeaders | null;
  while ((headers = await decodeHeaders(reader))) {
    const type = headers['Content-Type'];
    const disposition = parseContentDisposition(headers['Content-Disposition']);
    const name = disposition?.filename || disposition?.name;
    const size = parseContentLength(headers['Content-Length']);
    if (!name) {
      throw new Error(
        'Invalid Multipart Part: Missing Content-Disposition name or filename parameter'
      );
    }

    let reachedEnd = false;
    let remaining = 0;
    let stream: ReadableStream;
    let cancel: () => Promise<void>;
    if (size !== null) {
      // With a known size, we output a sized stream (similar to tar files)
      remaining = size;
      stream = new ReadableStream(
        {
          expectedLength: size,
          cancel: (cancel = async function cancel() {
            if (remaining > 0) {
              remaining = await reader.skip(remaining);
              if (remaining > 0)
                throw new Error('Invalid Multipart Part: Unexpected EOF');
            }
            if (!reachedEnd) {
              await expectTrailer(reader, boundary);
              reachedEnd = true;
            }
          }),
          async pull(controller) {
            if (remaining) {
              const buffer = await reader.pull(remaining);
              if (!buffer)
                throw new Error('Invalid Multipart Part: Unexpected EOF');
              remaining -= buffer.byteLength;
              controller.enqueue(copyUint8Array(buffer));
            }
            if (!remaining) {
              await expectTrailer(reader, boundary);
              reachedEnd = true;
              controller.close();
            }
          },
        },
        streamParams
      );
    } else {
      // Without a size, we instead output a stream that ends at the multipart boundary
      const iterator = readUntilBoundary(reader, boundary.trailer);
      stream = new ReadableStream(
        {
          cancel: (cancel = async function cancel() {
            for await (const chunk of iterator) {
              if (!chunk) {
                throw new Error('Invalid Multipart Part: Unexpected EOF');
              }
            }
            reachedEnd = true;
          }),
          async pull(controller) {
            const result = await iterator.next();
            if (result.done) {
              controller.close();
              reachedEnd = true;
            } else if (!result.value) {
              throw new Error('Invalid Multipart Part: Unexpected EOF');
            } else {
              controller.enqueue(copyUint8Array(result.value));
            }
          },
        },
        streamParams
      );
    }

    yield new StreamFile(stream, name, {
      type: type ?? undefined,
      size: size ?? undefined,
    });

    if (remaining > 0 || !reachedEnd) {
      await (stream.locked ? cancel() : stream.cancel());
    }
  }
}
