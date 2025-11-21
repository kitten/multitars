import { describe, it, expect, vi } from 'vitest';
import { streamMultipart } from '../multipartOutput';
import { iterableToStream, streamToText } from './utils';

vi.mock('../multipartEncoding', async importOriginal => ({
  ...(await importOriginal()),
  BOUNDARY_ID: '----formdata-multitars',
}));

describe('streamMultipart', () => {
  it('creates a multipart stream of strings', async () => {
    const data = streamMultipart(
      (async function* () {
        yield ['a', '1'];
        yield ['b', '2'];
      })()
    );

    expect(await streamToText(iterableToStream(data))).toMatchInlineSnapshot(`
      "------formdata-multitars
      Content-Disposition: form-data; name="a"

      1
      ------formdata-multitars
      Content-Disposition: form-data; name="b"

      2
      ------formdata-multitars--

      "
    `);
  });

  it('creates a multipart stream of files', async () => {
    const data = streamMultipart(
      (async function* () {
        yield ['a', new File(['1'], '1.txt')];
        yield ['b', new File(['2'], '2.txt')];
      })()
    );

    expect(await streamToText(iterableToStream(data))).toMatchInlineSnapshot(`
      "------formdata-multitars
      Content-Disposition: form-data; name="a"; filename="1.txt"
      Content-Length: 1

      1
      ------formdata-multitars
      Content-Disposition: form-data; name="b"; filename="2.txt"
      Content-Length: 1

      2
      ------formdata-multitars--

      "
    `);
  });

  it('creates a multipart stream of files with content types', async () => {
    const data = streamMultipart(
      (async function* () {
        yield ['a', new File(['1'], '1.txt', { type: 'text/plain' })];
        yield ['b', new File(['2'], '2.txt', { type: 'test/plain' })];
      })()
    );

    expect(await streamToText(iterableToStream(data))).toMatchInlineSnapshot(`
      "------formdata-multitars
      Content-Disposition: form-data; name="a"; filename="1.txt"
      Content-Type: text/plain
      Content-Length: 1

      1
      ------formdata-multitars
      Content-Disposition: form-data; name="b"; filename="2.txt"
      Content-Type: test/plain
      Content-Length: 1

      2
      ------formdata-multitars--

      "
    `);
  });

  it('encodes special filenames', async () => {
    const filename = 'newline\nfi+l en"am👍e.txt';
    const data = streamMultipart(
      (async function* () {
        yield [filename, new File(['1'], filename)];
      })()
    );

    expect(await streamToText(iterableToStream(data))).toMatchInlineSnapshot(`
      "------formdata-multitars
      Content-Disposition: form-data; name="newline%0Afi+l en%22am👍e.txt"; filename="newline%0Afi+l en%22am👍e.txt"
      Content-Length: 1

      1
      ------formdata-multitars--

      "
    `);
  });
});
