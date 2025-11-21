import { streamToAsyncIterable } from '../conversions';
export { iterableToStream } from '../conversions';

export async function streamToBuffer(
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

export async function streamToText(
  stream: ReadableStream<Uint8Array>
): Promise<string> {
  let output = '';
  const decoder = new TextDecoder();
  for await (const chunk of streamToAsyncIterable(stream))
    output += decoder.decode(chunk, { stream: true });
  return output;
}

const encoder = new TextEncoder();

export function utf8Encode(
  content: string | ArrayBufferView | ArrayBufferLike
): Uint8Array {
  return typeof content === 'string'
    ? encoder.encode(content)
    : new Uint8Array('buffer' in content ? content.buffer : content);
}

export async function* streamChunks({
  numChunks,
  chunkSize,
}: {
  numChunks: number;
  chunkSize: number;
}) {
  let x = 0;
  for (let chunk = 0; chunk < numChunks; chunk++) {
    await Promise.resolve();
    const bytes = new Uint8Array(chunkSize);
    for (let idx = 0; idx < chunkSize; idx++) bytes[idx] = x++;
    yield bytes;
  }
}

export async function* streamText(
  text: string,
  chunkSize: number
): AsyncGenerator<Uint8Array<ArrayBuffer>> {
  const encoded = utf8Encode(text);
  for (let idx = 0; idx < encoded.byteLength; idx += chunkSize) {
    await Promise.resolve();
    yield encoded.subarray(idx, idx + chunkSize) as Uint8Array<ArrayBuffer>;
  }
}
