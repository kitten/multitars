# multitars

## 0.1.0

### Minor Changes

- Add basic README
  Submitted by [@kitten](https://github.com/kitten) (See [`87831f1`](https://github.com/kitten/multitars/commit/87831f1c7e0e163d54f1992f220440db99c5e20f))
- Accept `ReadableStream` inputs on `tar` and `streamMultipart`
  Submitted by [@kitten](https://github.com/kitten) (See [#5](https://github.com/kitten/multitars/pull/5))
- Accept `Iterable<Uint8Array>` and `AsyncIterable<Uint8Array>` on `untar` and `parseMultipart`
  Submitted by [@kitten](https://github.com/kitten) (See [#5](https://github.com/kitten/multitars/pull/5))
- Add `iterableToStream` and `streamToAsyncIterable` conversion helpers
  Submitted by [@kitten](https://github.com/kitten) (See [#4](https://github.com/kitten/multitars/pull/4))

### Patch Changes

- Improve multipart's boundary search performance
  Submitted by [@kitten](https://github.com/kitten) (See [#6](https://github.com/kitten/multitars/pull/6))

## 0.0.3

### Patch Changes

- Normalize type flag of `CONTIGUOUS_FILE` and `OLD_FILE` to `FILE`
  Submitted by [@kitten](https://github.com/kitten) (See [`d8f1785`](https://github.com/kitten/multitars/commit/d8f1785da78b9ed2359e1cb7c19387cabccd055d))
- Add missing `FormEntry` export
  Submitted by [@kitten](https://github.com/kitten) (See [`8fae4f3`](https://github.com/kitten/multitars/commit/8fae4f3740f3c9d278d6f7faee757b2d684af0cc))

## 0.0.2

### Patch Changes

- Generate random boundary ID for multipart output and expose `multipartContentType`
  Submitted by [@kitten](https://github.com/kitten) (See [`54b65ac`](https://github.com/kitten/multitars/commit/54b65ac7b50b2981c5ee182eeabaaedafb9dd489))

## 0.0.1

Initial Release.
