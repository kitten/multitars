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

interface SafeIteratorSourceOptions {
  signal?: AbortSignal;
  expectedLength?: number | bigint;
}

export interface BodyReadableStream<T> extends ReadableStream<T> {
  signal: AbortSignal;
}

/** Converts an `AsyncIterable` or `Iterable` into a safe `ReadableStream` with a safety `AbortSignal`
 * @remarks
 * This helper converts an iterable to a `ReadableStream` with a paired `AbortSignal`. The `AbortSignal`
 * will abort when the underlying iterable errors.
 *
 * A common problem with Fetch Standard implementations is that a `ReaadbleStream` passed to
 * a request does not propagate its error once the request has started. This prevents the
 * request from being cancelled and the error from propagating to the response when the input
 * Readable Stream errors.
 * This helper provides an AbortSignal to forcefully abort the request when the underlying iterable
 * errors.
 *
 * @param iterable - The AsyncIterable to wrap and catch errors from
 * @param sourceOptions - An optional `expectedLength` and parent `signal` that may propagate to the output `ReadableStream`
 * @returns `BodyReadableStream` that is a converted `ReadableStream` of the iterable with a `signal: AbortSignal` property that aborts when the iterable errors.
 */
export function iterableToStream<T>(
  iterable: AsyncIterable<T> | Iterable<T>,
  sourceOptions?: SafeIteratorSourceOptions
): BodyReadableStream<T> {
  const signal = sourceOptions?.signal;
  const abortController = new AbortController();
  let iterator: AsyncIterator<T> | AsyncIterator<T>;
  return Object.assign(
    new ReadableStream<T>(
      {
        expectedLength: sourceOptions?.expectedLength,
        start() {
          iterator = iterable[Symbol.asyncIterator]
            ? iterable[Symbol.asyncIterator]()
            : iterable[Symbol.iterator]();
          signal?.throwIfAborted();
          signal?.addEventListener('abort', () =>
            abortController.abort(signal.reason)
          );
        },
        async pull(controller) {
          try {
            signal?.throwIfAborted();
            const next = await iterator.next();
            if (next.value) controller.enqueue(next.value);
            if (next.done) controller.close();
          } catch (error) {
            controller.error(error);
            abortController.abort(error);
          }
        },
        async cancel(reason) {
          if (reason) await iterator.throw?.(reason);
          await iterator.return?.();
        },
      },
      { highWaterMark: 0 }
    ),
    { signal: abortController.signal }
  );
}
