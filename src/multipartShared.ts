import { StreamFile, StreamFileOptions } from './file';

export interface MultipartPartOptions extends StreamFileOptions {
  headers?: MultipartHeaders;
}

export interface MultipartHeaders {
  'content-disposition'?: string;
  'content-length'?: string;
  'content-type'?: string;
  [headerName: string]: string | undefined;
}

export class MultipartPart extends StreamFile {
  headers: MultipartHeaders;

  constructor(
    stream: ReadableStream<Uint8Array<ArrayBuffer>> | BlobPart[],
    name: string,
    options?: MultipartPartOptions
  ) {
    super(stream, name, options ?? {});
    this.headers = options?.headers || Object.create(null);
    if (options?.size) {
      this.headers['content-length'] = `${options.size}`;
    }
    if (options?.type) {
      this.headers['content-type'] = `${options.type}`;
    }
  }
}
