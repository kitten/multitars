import { describe, bench, afterAll } from 'vitest';
import { Readable } from 'node:stream';
import { generate, cleanup } from './fixtures/generateTars';

import * as multitars from './fixtures/lib';
import * as modernTar from 'modern-tar';
import * as tarParser from '@remix-run/tar-parser';
import * as tarStream from 'tar-stream';
import * as tar from 'tar';

const files = await generate();

afterAll(async () => {
  await cleanup();
});

describe.each([
  { name: '2500 x 1KB', file: files.smallFiles },
  { name: '20 x 5MB', file: files.largeFiles },
  { name: 'nested 1KB', file: files.nestedFiles },
  { name: 'worker sample', file: files.workerSample },
])('untar ($name)', input => {
  bench('multitars', async () => {
    await runMultitars(input.file);
  });

  bench('modern-tar', async () => {
    await runModernTar(input.file);
  });

  bench('@remix-run/tar-parser', async () => {
    await runTarParser(input.file);
  });

  bench('tar', async () => {
    await runTar(input.file);
  });

  bench('tar-stream', async () => {
    await runTarStream(input.file);
  });
});

async function runMultitars(input: Buffer) {
  const blob = new Blob([input as any]);
  for await (const _ of multitars.untar(blob.stream())) {
    // noop
  }
}

async function runModernTar(input: Buffer) {
  const blob = new Blob([input as any]);
  for await (const _ of blob
    .stream()
    .pipeThrough(modernTar.createTarDecoder())) {
    // noop
  }
}

async function runTarParser(input: Buffer) {
  const blob = new Blob([input as any]);
  await tarParser.parseTar(blob.stream(), () => {});
}

async function runTar(input: Buffer) {
  await new Promise(resolve => {
    Readable.fromWeb(new Blob([input as any]).stream() as any)
      .pipe(tar.t())
      .on('entry', entry => {
        entry.resume();
      })
      .on('finish', () => {
        resolve(null);
      });
  });
}

async function runTarStream(input: Buffer) {
  await new Promise<void>((resolve, reject) => {
    Readable.fromWeb(new Blob([input as any]).stream() as any)
      .pipe(tarStream.extract())
      .on('error', reject)
      .on('entry', (_header, stream, next) => {
        stream.on('end', () => next());
        stream.resume();
      })
      .on('finish', () => {
        resolve();
      });
  });
}
