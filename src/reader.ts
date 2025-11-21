import {
  type ReadableStreamLike,
  StreamIterator,
  streamLikeToIterator,
} from './conversions';

/** A reader that can output fixed size pages of underlying byte streams.
 * @remarks
 * The `ReadableStreamBlockReader` accepts a `ReadableStream<Uint8Array>` and a given
 * `blockSize`, and upon calling `read()`, outputs fixed sizes blocks. This is useful
 * for paged readers and parsers.
 */
export class ReadableStreamBlockReader {
  // The block-wise reader has three sets of byte sources from which it'll read in order:
  // 1. this.buffer
  // 2. this.nextRead
  // 3. this.reader

  // (1) This buffer is filled using this.pushback(). This is used when data is "put back"
  // onto ReadableStreamBlockReader, for example, when we "peek" at data but want a future
  // read call to see it again. This buffer is filled in reverse.
  private buffer: Uint8Array;
  private bufferSize: number;

  // (2) This is a pointer to a chunk of bytes. When a call to reader.read() returned "too much"
  // data (e.g. beyond .pull(maxSize) or beyond .read()'s blockSize, then nextRead is set
  // to the remaining data.
  private nextRead: Uint8Array | null;

  // (3) The reader gets data from the underlying ReadableStream. It's wrapped in SerializedReader
  // to prevent concurrent reads from failing. Instead, they'll be shared between calls.
  private next: StreamIterator<Uint8Array>;

  readonly blockSize: number;
  readonly block: Uint8Array;

  constructor(stream: ReadableStreamLike<Uint8Array>, blockSize: number) {
    this.next = streamLikeToIterator(stream);
    this.blockSize = blockSize;
    this.block = new Uint8Array(blockSize);
    this.nextRead = null;
    this.buffer = new Uint8Array(blockSize);
    this.bufferSize = 0;
  }

  /** Outputs a `Uint8Array` buffer of the specified block size.
   * @param allowPartialEnd - When true, allows an undersized final chunk to be returned
   * @remarks
   * Resolves a `Uint8Array` block of `blockSize` length, but will
   * return `null` if the stream is exhausted and no block of the
   * given size could be retrieved. When this method is called, the
   * block is consumed, and a subsequent method will consume data
   * after this block instead.
   * Call `pull()` to get the remaining buffer if this method returns
   * `null` but the data after the block is important.
   */
  async read(allowPartialEnd?: boolean): Promise<Uint8Array | null> {
    const { blockSize, block } = this;

    // (1): We can skip copying if the current buffer is exactly one block
    if (this.bufferSize === blockSize) {
      this.bufferSize = 0;
      return this.buffer;
    }

    // (2): Otherwise, copy buffers into `block`
    let byteLength = 0;
    if (this.bufferSize > 0) {
      block.set(this.buffer.subarray(-this.bufferSize), byteLength);
      byteLength += this.bufferSize;
      this.bufferSize = 0;
    }

    let remaining = blockSize - byteLength;
    if (remaining > 0 && this.nextRead != null) {
      if (this.nextRead.byteLength > remaining) {
        // Optimization: Return early if block is filled with nextRead
        block.set(this.nextRead.subarray(0, remaining), byteLength);
        this.nextRead = this.nextRead.subarray(remaining);
        return block;
      } else {
        block.set(this.nextRead, byteLength);
        byteLength += this.nextRead.byteLength;
        this.nextRead = null;
      }
    }

    // (3): If `block` isn't filled yet, start filling it with data from the byte stream
    while ((remaining = blockSize - byteLength) > 0) {
      const { done, value: view } = await this.next();
      if (done || !view?.byteLength) {
        break;
      } else if (view.byteLength > remaining) {
        this.nextRead = view.subarray(remaining);
        if (byteLength === 0) {
          // Optimization: If `block` is still empty, we can just return this buffer directly
          return view.subarray(0, remaining);
        } else {
          block.set(view.subarray(0, remaining), byteLength);
          return block;
        }
      } else {
        block.set(view, byteLength);
        byteLength += view.byteLength;
      }
    }

    if (byteLength < blockSize && allowPartialEnd) {
      return byteLength > 0 ? block.subarray(0, byteLength) : null;
    } else if (byteLength < blockSize) {
      // (4) Failure case: If we can't fill the block, push back remaining bytes
      this.pushback(block.subarray(0, byteLength));
      return null;
    } else {
      return block;
    }
  }

  /** Outputs a `Uint8Array` buffer that's at most `maxSize` long.
   * @remarks
   * Resolves a `Uint8Array` block of at most `maxSize` length. When a
   * buffer returned by the underlying byte stream is too long, it's
   * instead buffered. When this method is called, the block it resolves
   * is consumed, and a subsequent method will consume data after this
   * block instead.
   */
  async pull(maxSize = this.blockSize): Promise<Uint8Array | null> {
    if (this.bufferSize > 0) {
      if (this.bufferSize <= maxSize) {
        const output = this.buffer.subarray(-this.bufferSize);
        this.bufferSize = 0;
        return output;
      } else {
        const output = this.buffer.subarray(
          -this.bufferSize,
          -(this.bufferSize - maxSize)
        );
        this.bufferSize -= maxSize;
        return output;
      }
    } else if (this.nextRead != null) {
      if (this.nextRead.byteLength <= maxSize) {
        const output = this.nextRead;
        this.nextRead = null;
        return output;
      } else {
        const output = this.nextRead.subarray(0, maxSize);
        this.nextRead = this.nextRead.subarray(maxSize);
        return output;
      }
    }

    const { done, value: view } = await this.next();
    if (done) {
      return null;
    } else if (view.byteLength > maxSize) {
      this.nextRead = view.subarray(maxSize);
      return view.subarray(0, maxSize);
    } else {
      return view;
    }
  }

  /** Skips `requestedSize` bytes from the underlying byte stream.
   * @remarks
   * Will skip at most `requestedSize` bytes in the underlying byte stream
   * and won't allow these bytes to be used/returned by other methods.
   * The resolved number is the amount of remaining bytes from `requestedSize`
   * that couldn't be skipped due to the end of the underlying byte stream
   * being reached.
   */
  async skip(requestedSize: number): Promise<number> {
    let remaining = requestedSize;

    if (this.bufferSize >= remaining) {
      this.bufferSize -= remaining;
      return 0;
    } else if (this.bufferSize > 0) {
      remaining -= this.bufferSize;
      this.bufferSize = 0;
    }

    if (this.nextRead != null) {
      if (this.nextRead.byteLength > remaining) {
        this.nextRead = this.nextRead.subarray(remaining);
        return 0;
      } else {
        remaining -= this.nextRead.byteLength;
        this.nextRead = null;
      }
    }

    while (remaining > 0) {
      const { done, value: view } = await this.next();
      if (done) {
        return remaining;
      } else if (view.byteLength > remaining) {
        this.nextRead = view.subarray(remaining);
        return 0;
      } else {
        remaining -= view.byteLength;
      }
    }

    return remaining;
  }

  /** Re-adds byte array back to buffered data */
  pushback(buffer: Uint8Array): void {
    if (buffer.byteLength > this.buffer.byteLength - this.bufferSize) {
      throw new RangeError('Pushback buffer is out of capacity');
    } else if (buffer.byteLength > 0) {
      reverseSet(this.buffer, buffer, this.bufferSize);
      this.bufferSize += buffer.byteLength;
    }
  }
}

export async function* readUntilBoundary(
  reader: ReadableStreamBlockReader,
  boundary: Uint8Array
): AsyncGenerator<Uint8Array | null> {
  if (boundary.byteLength > reader.blockSize) {
    throw new TypeError(
      `Boundary must be shorter than block size (${boundary.byteLength} > ${reader.blockSize})`
    );
  }
  // Finding a boundary sequence in a byte stream is tricky
  // Say, the boundary is in any way internally repetitive, e.g. `--x--x\r\n`
  // If the boundary is then cut off at its internal repetition point, we
  // have to search the end of the previous buffer repeatedly to find
  // the boundary successfully:
  //   --x--|x--x\r\n
  // If we only search the first buffer once, we risk missing it due to the repetition.
  const prevBuffer = new Uint8Array(reader.blockSize);
  for (
    let buffer = await reader.read(true), nextBuffer: Uint8Array | null = null;
    buffer != null || (buffer = await reader.read(true)) != null;
    nextBuffer = null
  ) {
    let searchIdx = -1;
    // (1): Search for the starting boundary character from `searchIdx`
    while ((searchIdx = buffer.indexOf(boundary[0], searchIdx + 1)) > -1) {
      // (2): Check if boundary matches (partially) at `searchIdx`
      let bufferIdx = searchIdx + 1;
      let boundaryIdx = 1;
      while (
        boundaryIdx < boundary.byteLength &&
        bufferIdx < buffer.byteLength &&
        boundary[boundaryIdx] === buffer[bufferIdx]
      ) {
        boundaryIdx++;
        bufferIdx++;
      }
      // (3): We either have found the boundary or a partial boundary
      if (boundaryIdx === boundary.byteLength) {
        // (3.1): Complete boundary is present in `buffer` at `searchStart`
        reader.pushback(buffer.subarray(bufferIdx));
        yield buffer.subarray(0, searchIdx);
        return;
      } else if (bufferIdx === buffer.byteLength) {
        // (4): Partial boundary was found at the end of `buffer`
        // Get the next buffer and search the rest of the boundary in `nextBuffer`
        if (!nextBuffer) {
          prevBuffer.set(buffer);
          buffer = prevBuffer.subarray(0, buffer.byteLength);
          nextBuffer = await reader.read(true);
          if (!nextBuffer) {
            // WARN(@kitten): This means we ran out of chunks unexpectedly (EOF) while searching for a boundary
            yield null;
            return;
          }
        }
        // (5): Check if remaining partial boundary matches in `nextBuffer`
        bufferIdx = 0;
        while (
          boundaryIdx < boundary.byteLength &&
          bufferIdx < nextBuffer.byteLength &&
          boundary[boundaryIdx] === nextBuffer[bufferIdx]
        ) {
          boundaryIdx++;
          bufferIdx++;
        }
        if (boundaryIdx === boundary.byteLength) {
          // Boundary found across `buffer` and `nextBuffer`
          reader.pushback(nextBuffer.subarray(bufferIdx));
          yield buffer.subarray(0, searchIdx);
          return;
        }
      }
    }
    // (6): Boundary wasn't found, so emit the full buffer, and search the next one
    const output = buffer;
    buffer = nextBuffer;
    yield output;
  }
  yield null;
}

function reverseSet(
  target: Uint8Array,
  source: Uint8Array,
  reverseOffset: number
): void {
  target.set(source, target.byteLength - source.byteLength - reverseOffset);
}
