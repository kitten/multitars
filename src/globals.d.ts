interface UnderlyingDefaultSource<R = any> {
  /** workerd's marker for ReadableStream byte length */
  expectedLength?: number;
}

interface ReadableStream<R = any> {
  [Symbol.asyncIterator](
    options?: ReadableStreamValuesOptions
  ): AsyncIterableIterator<R>;
}
