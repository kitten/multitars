import { describe, it, expect } from 'vitest';
import { parseMultipart } from '../multipartInput';
import { multipartContentType, streamMultipart } from '../multipartOutput';
import { iteratorToStream } from './utils';

function chunk(
  readable: ReadableStream<Uint8Array>
): ReadableStream<Uint8Array> {
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  return new ReadableStream({
    start() {
      reader = readable.getReader();
    },
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) return controller.close();
      for (let sliceIdx = 0; sliceIdx < value.length; sliceIdx += 500) {
        controller.enqueue(value.subarray(sliceIdx, sliceIdx + 500));
      }
    },
  });
}

describe('parseMultipart', () => {
  it('extracts a file from a multipart body successfully (unchunked)', async () => {
    const form = new FormData();
    form.set('filename-a.txt', new File(['test content a'], 'filename-a.txt'));
    form.set('filename-b.txt', new File(['test content b'], 'filename-b.txt'));
    const request = new Request('http://test.com', {
      method: 'POST',
      body: form as any,
    });

    const entries: any[] = [];
    const contentType = request.headers.get('Content-Type')!;
    const multipart = parseMultipart(request.body!, { contentType });
    for await (const entry of multipart) {
      entries.push({
        name: entry.name,
        size: entry.size,
        type: entry.type,
        text: await entry.text(),
      });
    }
    expect(entries).toMatchSnapshot();
  });

  it('extracts a file from a multipart body successfully (chunked)', async () => {
    const form = new FormData();
    form.set(
      'filename-a.txt',
      new File(['test content a'], 'filename-a.txt', { type: 'plain/text' })
    );
    form.set('filename-b.txt', new File(['test content b'], 'filename-b.txt'));
    const request = new Request('http://test.com', {
      method: 'POST',
      body: form as any,
    });

    const entries: any[] = [];
    const contentType = request.headers.get('Content-Type')!;
    const multipart = parseMultipart(chunk(request.body!), { contentType });
    for await (const entry of multipart) {
      entries.push({
        name: entry.name,
        size: entry.size,
        text: await entry.text(),
      });
    }
    expect(entries).toMatchSnapshot();
  });

  it('extracts a file from a multipart body successfully if the first file is skipped (unchunked)', async () => {
    const form = new FormData();
    form.set('filename-a.txt', new File(['test content a'], 'filename-a.txt'));
    form.set('filename-b.txt', new File(['test content b'], 'filename-b.txt'));
    const request = new Request('http://test.com', {
      method: 'POST',
      body: form as any,
    });

    const entries: any[] = [];
    const contentType = request.headers.get('Content-Type')!;
    const multipart = parseMultipart(request.body!, { contentType });
    for await (const entry of multipart) {
      if (entry.name === 'filename-a.txt') {
        await entry.stream().cancel();
        continue;
      }
      entries.push({
        name: entry.name,
        size: entry.size,
        type: entry.type,
        text: await entry.text(),
      });
    }
    expect(entries).toMatchSnapshot();
  });

  it('extracts a file from a multipart body successfully if the first file is skipped (chunked)', async () => {
    const form = new FormData();
    form.set('filename-a.txt', new File(['test content a'], 'filename-a.txt'));
    form.set('filename-b.txt', new File(['test content b'], 'filename-b.txt'));
    const request = new Request('http://test.com', {
      method: 'POST',
      body: form as any,
    });

    const entries: any[] = [];
    const contentType = request.headers.get('Content-Type')!;
    const multipart = parseMultipart(chunk(request.body!), { contentType });
    for await (const entry of multipart) {
      if (entry.name === 'filename-a.txt') {
        await entry.stream().cancel();
        continue;
      }
      entries.push({
        name: entry.name,
        size: entry.size,
        type: entry.type,
        text: await entry.text(),
      });
    }
    expect(entries).toMatchSnapshot();
  });

  it('extracts special characters in filename successfully', async () => {
    const filename = 'newline\nfi+l en"am👍e.txt';
    const form = new FormData();
    form.set(filename, new File(['test content a'], filename));
    const request = new Request('http://test.com', {
      method: 'POST',
      body: form as any,
    });

    const contentType = request.headers.get('Content-Type')!;
    const multipart = parseMultipart(chunk(request.body!), { contentType });
    for await (const entry of multipart) {
      expect(entry.name).toBe(filename);
    }
  });

  it('extracts streamMultipart output successfully', async () => {
    const body = iteratorToStream(
      streamMultipart(
        (async function* () {
          yield [
            'filename-a',
            new File(['test content a'], 'filename-a.txt', {
              type: 'plain/text',
            }),
          ];
          yield ['filename-b', new File(['test content b'], 'filename-b.txt')];
        })()
      )
    );

    const entries: any[] = [];
    const multipart = parseMultipart(body, {
      contentType: multipartContentType,
    });
    for await (const entry of multipart) {
      entries.push({
        name: entry.name,
        size: entry.size,
        type: entry.type,
        text: await entry.text(),
      });
    }
    expect(entries).toMatchSnapshot();
  });

  it('extracts streamMultipart output successfully if the first file is skipped', async () => {
    const body = iteratorToStream(
      streamMultipart(
        (async function* () {
          yield [
            'filename-a.txt',
            new File(['test content a'], 'filename-a.txt', {
              type: 'plain/text',
            }),
          ];
          yield [
            'filename-b.txt',
            new File(['test content b'], 'filename-b.txt'),
          ];
        })()
      )
    );

    const entries: any[] = [];
    const multipart = parseMultipart(body, {
      contentType: multipartContentType,
    });
    for await (const entry of multipart) {
      if (entry.name === 'filename-a.txt') {
        await entry.stream().cancel();
        continue;
      }
      entries.push({
        name: entry.name,
        size: entry.size,
        type: entry.type,
        text: await entry.text(),
      });
    }
    expect(entries).toMatchSnapshot();
  });

  it('extracts streamMultipart output entries successfully if the first entry is skipped', async () => {
    const body = iteratorToStream(
      streamMultipart(
        (async function* () {
          yield ['a', 'test-content-a'];
          yield ['b', 'test-content-b'];
        })()
      )
    );

    const entries: any[] = [];
    const multipart = parseMultipart(body, {
      contentType: multipartContentType,
    });
    for await (const entry of multipart) {
      if (entry.name === 'a') {
        await entry.stream().cancel();
        continue;
      }
      entries.push({
        name: entry.name,
        size: entry.size,
        type: entry.type,
        text: await entry.text(),
      });
    }
    expect(entries).toMatchSnapshot();
  });
});
