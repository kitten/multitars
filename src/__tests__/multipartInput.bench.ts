import { describe, bench, afterAll } from 'vitest';
import { Readable } from 'node:stream';
import { generate, cleanup } from './fixtures/generateMultipart';

import * as multitars from './fixtures/lib';
import * as fastifyBusboy from '@fastify/busboy';

const files = await generate();

afterAll(async () => {
  await cleanup();
});

describe.each([
  { name: '2500 x 1KB w/ Content-Length', file: files.smallFiles },
  { name: '15 x 5MB w/ Content-Length', file: files.largeFiles },
  { name: '2500 x 1KB boundary search', file: files.smallFilesNoLength },
  { name: '15 x 5MB boundary search', file: files.largeFilesNoLength },
])('multipart ($name)', input => {
  bench('multitars', async () => {
    await runMultitars(input.file);
  });

  bench('@fastify/busboy', async () => {
    await runFastifyBusboy(input.file);
  });
});

async function runMultitars(input: Buffer) {
  const blob = new Blob([input as any]);
  const params = { contentType: files.contentType };
  for await (const _ of multitars.parseMultipart(blob.stream(), params)) {
    // noop
  }
}

async function runFastifyBusboy(input: Buffer) {
  await new Promise((resolve, reject) => {
    Readable.fromWeb(new Blob([input as any]).stream() as any)
      .pipe(
        new fastifyBusboy.Busboy({
          headers: { 'content-type': files.contentType },
          limits: { fileSize: Infinity },
        })
      )
      .on('error', reject)
      .on('field', () => {})
      .on('file', (_name, stream) => {
        stream.resume();
      })
      .on('finish', () => {
        resolve(null);
      });
  });
}
