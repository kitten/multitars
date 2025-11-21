import { encodeName } from './multipartEncoding';
import {
  streamToAsyncIterable,
  BOUNDARY_ID,
  type ReadableStreamLike,
  streamLikeToIterator,
} from './conversions';

const CRLF = '\r\n';
const BOUNDARY_HYPHEN_CHARS = '--';

const FORM_FOOTER =
  BOUNDARY_HYPHEN_CHARS + BOUNDARY_ID + BOUNDARY_HYPHEN_CHARS + CRLF + CRLF;

const isBlob = (value: unknown): value is Blob =>
  typeof value === 'object' &&
  value != null &&
  (value instanceof Blob || 'type' in value);

interface ContentDispositionParams {
  name: string;
  filename?: string;
}

interface FormExtraHeaders {
  'Content-Type'?: string;
  'Content-Length'?: number;
}

const makeFormHeader = (
  params: ContentDispositionParams,
  headers: FormExtraHeaders | undefined
): string => {
  let header = BOUNDARY_HYPHEN_CHARS + BOUNDARY_ID + CRLF;
  header += `Content-Disposition: form-data; name="${encodeName(params.name)}"`;
  if (params.filename != null)
    header += `; filename="${encodeName(params.filename)}"`;
  if (headers?.['Content-Type'])
    header += `${CRLF}Content-Type: ${headers['Content-Type']}`;
  // NOTE(@kitten): When size is zero, we don't send it. Since we're streaming
  // files, some files may not have a known size (See: StreamFile)
  if (headers?.['Content-Length'])
    header += `${CRLF}Content-Length: ${headers['Content-Length']}`;
  header += CRLF;
  header += CRLF;
  return header;
};

type FormValue = string | Uint8Array<ArrayBuffer> | Blob | File;
export type FormEntry = readonly [name: string, value: FormValue];

export const multipartContentType = `multipart/form-data; boundary=${BOUNDARY_ID}`;

export async function* streamMultipart(
  entries: ReadableStreamLike<FormEntry>
): AsyncGenerator<Uint8Array<ArrayBuffer>> {
  const next = streamLikeToIterator(entries);
  const encoder = new TextEncoder();
  let result: Awaited<ReturnType<typeof next>>;
  while (!(result = await next()).done && result.value) {
    const name = result.value[0];
    const value = result.value[1];
    if (isBlob(value)) {
      yield encoder.encode(
        makeFormHeader(
          { name, filename: 'name' in value ? value.name : name },
          {
            'Content-Type': value.type,
            'Content-Length': value.size,
          }
        )
      );
      yield* streamToAsyncIterable(value.stream());
    } else {
      yield encoder.encode(makeFormHeader({ name }, undefined));
      yield typeof value === 'string' ? encoder.encode(value) : value;
    }
    yield encoder.encode(CRLF);
  }
  yield encoder.encode(FORM_FOOTER);
}
