# multitars

`multitars` is a memory-efficient parser and producer of [Tar archives](https://www.gnu.org/software/tar/manual/html_node/Standard.html)
and [`multipart/form-data` bodies](https://datatracker.ietf.org/doc/html/rfc2388).

## Implementation

The goal of `multitars` is to allow any JavaScript runtime that supports the
[Web Streams API standard](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API)
to efficiently consume and/or produce Tar and form-data `ReadableStream` data without buffering
them in full.

This has been built with the explicit purpose in mind to:

- Accept `Request` bodies in the `tar` or `multipart/form-data` format
- Send `Request` bodies in the `tar` or `multipart/form-data` format
- Transform arbitrarily-sized `tar` or `multipart/form-data` streams

As such, the underlying implementation uses fixed block size reading to parse
Tar chunks and Form-data boundaries, switching to pull-based reading when possible
to keep overhead to a minimum.

- The tar implementation should match [`node-tar`](https://github.com/isaacs/node-tar)'s support of the Tar format (including PAX)
- The multipart implementation optionally accepts a `Content-Length` header in boundaries
- Both parsers operate on `StreamFile` which extends the standard `File` API

## API Reference

### `parseMultipart(stream: ReadableStream, params: ParseMultipartParams) => AsyncGenerator<StreamFile>`

- Accepts a `ReadableStream`
- **Parameters**
  - `contentType`: The raw `Content-Type` header to search a `boundary=*` in

Returns an async iterable (as `AsyncGenerator`) of `StreamFile` with individual form-data values.

When a `StreamFile` isn't consumed, it's skipped before the next one is emitted.

### `streamMultipart(entries: AsyncIterable<FormEntry> | Iterable<FormEntry>): AsyncGenerator<Uint8Array>`

- Accepts an `Iterable` or `AsyncIterable` of `FormEntry`s
  - `[string, string | Uint8Array | Blob | File]` tuples

Returns an async iterable of `Uint8Array` chunks encoding the output body stream.

### `multipartContentType: string`

The string value that `Content-Type` should be set to when sending `streamMultipart()`'s output as request bodies.
This contains a seeded multipart boundary identifier.

### `untar(stream: ReadableStream) => AsyncGenerator<TarFile | TarChunk>`

- Accepts a `ReadableStream`

Returns an async iterable (as `AsyncGenerator`) of `TarFile`, for files in the Tar archive, and `TarChunk` for non-files.

When a `TarFile`/`TarChunk` isn't consumed, it's skipped before the next one is emitted.

### `tar(entries: AsyncIterable<TarChunk | TarFile> | Iterable<TarChunk | TarFile>) => AsyncGenerator<Uint8Array>`

- Accepts an `Iterable` or `AsyncIterable` of `TarChunk`s and `TarFile`s

Returns an async iterable of `Uint8Array` chunks encoding the output Tar archive stream.
The Tar archive will use PAX headers in its output.

### `interface TarChunkHeader`

A `TarFile` or `TarChunk` represent entries in a Tar archive. They have a set of common properties based on the Tar headers.

**Properties:**

- `mode`: Permission fields
- `uid`: User ID (if applicable/set, otherwise `0`)
- `gid`: Group ID (if applicable/set, otherwise `0`)
- `mtime`: Modified Time (if applicable/set, otherwise `0`)
- `linkname`: Only set for symlinks (the linked to name)
- `uname`: User Name (if applicable/set)
- `gname`: Group Name (if applicable/set)
- `typeflag: TarTypeFlag`: The type of the Tar entry

### `enum TarTypeFlag`

```ts
export enum TarTypeFlag {
  FILE = 48 /* '0': regular file */,
  LINK = 49 /* '1': link */,
  SYMLINK = 50 /* '2': symbolic link */,
  DIRECTORY = 53 /* '5': directory */,
}
```

### `class TarFile implements TarChunkHeader`

A `TarFile` represents a file in a Tar archive. It can be consumed or streamed like a regular `File`.
Its `typeflag` property is always set to `TarTypeFlag.FILE`.

### `class TarChunk implements TarChunkHeader`

A `TarChunk` represents a non-file in a Tar archive, which are hardlinks, symlinks, or directories.
They typically don't carry content bodies, but their content is preserved if they do contain any data.

Note that `TarChunk`s for directories (`typeflag: TarTypeFlag.DIRECTORY`) are optional and `multitars` does
not validate the directory structure of Tar archives since it streams any Tar contents. Tar archives may
contain nested files in directories without any `TarChunk` for directories being emitted.
