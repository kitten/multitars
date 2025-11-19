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

export let BOUNDARY_ID = '----formdata-';
for (let i = 16; i > 0; i--) {
  BOUNDARY_ID += ((Math.random() * 1e8) | 0).toString(36)[0];
}
