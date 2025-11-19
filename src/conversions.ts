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
