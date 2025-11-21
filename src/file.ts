import { streamToAsyncIterable } from './conversions';

async function streamToBuffer(
  stream: ReadableStream<Uint8Array>
): Promise<Uint8Array<ArrayBuffer>> {
  let byteLength = 0;
  const chunks: Uint8Array[] = [];
  for await (const chunk of streamToAsyncIterable(stream)) {
    byteLength += chunk.byteLength;
    chunks.push(chunk);
  }
  const buffer = new Uint8Array(byteLength);
  for (
    let chunkIndex = 0, byteIndex = 0;
    chunkIndex < chunks.length;
    chunkIndex++
  ) {
    const chunk = chunks[chunkIndex];
    buffer.set(chunk as Uint8Array, byteIndex);
    byteIndex += chunk.byteLength;
  }
  return buffer;
}

async function streamToText(
  stream: ReadableStream<Uint8Array>
): Promise<string> {
  let output = '';
  const decoder = new TextDecoder();
  for await (const chunk of streamToAsyncIterable(stream))
    output += decoder.decode(chunk, { stream: true });
  return output;
}

export interface StreamFileOptions {
  type?: string;
  lastModified?: number;
  size?: number;
}

export class StreamFile extends File {
  #stream: ReadableStream<Uint8Array<ArrayBuffer>>;
  #lastModified: number;
  #size: number;
  #type: string;
  #name: string;

  constructor(
    stream: ReadableStream<Uint8Array<ArrayBuffer>>,
    name: string,
    options: StreamFileOptions
  ) {
    super([], name, options);
    this.#stream = stream;
    this.#type = options.type ?? 'application/octet-stream';
    this.#lastModified = options.lastModified || 0;
    this.#size = options.size || 0;
    this.#name = name;
  }

  get lastModified() {
    return this.#lastModified;
  }

  get size() {
    return this.#size;
  }

  get name() {
    return this.#name;
  }

  set name(name: string) {
    this.#name = name;
  }

  get type() {
    return this.#type;
  }

  set type(type: string) {
    this.#type = type;
  }

  stream() {
    return this.#stream;
  }

  async bytes() {
    return await streamToBuffer(this.#stream);
  }

  async arrayBuffer() {
    return (await this.bytes()).buffer;
  }

  async text() {
    return await streamToText(this.#stream);
  }

  async json() {
    return JSON.parse(await this.text());
  }

  slice(): never {
    throw new TypeError(
      "StreamFiles are streams and don't support conversion to Blobs"
    );
  }
}
