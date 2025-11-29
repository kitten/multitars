import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import fs from 'node:fs';

import {
  MultipartPart,
  streamMultipart,
  iterableToStream,
  FormEntry,
  multipartContentType,
} from './lib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(__dirname, 'temp');

await fs.promises.mkdir(tmpDir, { recursive: true });

function* generateSmallFiles(includeSize: boolean): Generator<FormEntry> {
  const content = new Uint8Array(1_024);
  crypto.getRandomValues(content);

  for (let i = 0; i < 2_500; i++) {
    yield [
      `file-${i}.txt`,
      new MultipartPart([content], `file-${i}.txt`, {
        size: includeSize ? content.byteLength : undefined,
        type: 'text/plain',
      }),
    ];
  }
}

function* generateLargeFiles(includeSize: boolean): Generator<FormEntry> {
  const content = new Uint8Array(5 * 1_024 * 1_024).fill('0'.charCodeAt(0));
  for (let i = 0; i < 15; i++) {
    yield [
      `file-${i}.txt`,
      new MultipartPart([content], `file-${i}.txt`, {
        size: includeSize ? content.byteLength : undefined,
        type: 'text/plain',
      }),
    ];
  }
}

async function toMultipart(
  targetPath: string,
  content: Generator<FormEntry>
): Promise<Buffer> {
  await pipeline(
    Readable.fromWeb(iterableToStream(streamMultipart(content)) as any),
    fs.createWriteStream(targetPath)
  );
  return await fs.promises.readFile(targetPath);
}

export async function generate() {
  return {
    contentType: multipartContentType,

    smallFiles: await toMultipart(
      path.join(tmpDir, 'small-files.bin'),
      generateSmallFiles(true)
    ),
    largeFiles: await toMultipart(
      path.join(tmpDir, 'large-files.bin'),
      generateLargeFiles(true)
    ),
    smallFilesNoLength: await toMultipart(
      path.join(tmpDir, 'small-files-no-length.bin'),
      generateSmallFiles(false)
    ),
    largeFilesNoLength: await toMultipart(
      path.join(tmpDir, 'large-files-no-length.bin'),
      generateLargeFiles(false)
    ),
  };
}

export async function cleanup() {
  await Promise.all([
    fs.promises.rm(path.join(tmpDir, 'small-files.bin')),
    fs.promises.rm(path.join(tmpDir, 'large-files.bin')),
    fs.promises.rm(path.join(tmpDir, 'small-files-no-length.bin')),
    fs.promises.rm(path.join(tmpDir, 'large-files-no-length.bin')),
  ]);
}
