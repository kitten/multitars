export type ReadableStreamLike<T> =
  | ReadableStream<T>
  | AsyncIterable<T>
  | Iterable<T>;

export function streamToIterator<T>(
  stream: ReadableStream<T>
): AsyncIterable<T> {
  if (!stream[Symbol.asyncIterator]) {
    return (async function* () {
      const reader = stream.getReader();
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) return chunk.value;
        yield chunk.value;
      }
    })();
  } else {
    return stream;
  }
}

type IteratorReadResult<T> =
  | { done: false; value: T }
  | { done: true; value?: T | undefined };

export type StreamIterator<T> = () => Promise<IteratorReadResult<T>>;

export function streamLikeToIterator<T>(
  stream: ReadableStreamLike<T>
): StreamIterator<T> {
  if ('getReader' in stream && typeof stream.getReader === 'function') {
    const reader = stream.getReader();
    return async function read() {
      return await reader.read();
    };
  } else {
    const iterator = stream[Symbol.asyncIterator]
      ? stream[Symbol.asyncIterator]()
      : stream[Symbol.iterator]();
    return async function next() {
      return await iterator.next();
    };
  }
}

export let BOUNDARY_ID = '----formdata-';
for (let i = 16; i > 0; i--) {
  BOUNDARY_ID += ((Math.random() * 1e8) | 0).toString(36)[0];
}
