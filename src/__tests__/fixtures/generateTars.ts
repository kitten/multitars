import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import fs from 'node:fs';

import { TarFile, tar, iterableToStream } from './lib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpDir = path.join(__dirname, 'temp');

await fs.promises.mkdir(tmpDir, { recursive: true });

function* generateSmallFiles() {
  const content = new Uint8Array(1_024);
  crypto.getRandomValues(content);

  for (let i = 0; i < 2_500; i++) {
    yield TarFile.from([content], `file-${i}.txt`, {
      size: content.byteLength,
    });
  }
}

function* generateLargeFiles() {
  const content = randomBytes(5 * 1_024 * 1_024);
  for (let i = 0; i < 20; i++) {
    yield TarFile.from([content], `file-${i}.txt`, {
      size: content.byteLength,
    });
  }
}

function* generateNestedFiles() {
  const structures = [
    // Simple nesting levels
    'level1',
    'level1/level2',
    'level1/level2/level3',
    'level1/level2/level3/level4',
    'level1/level2/level3/level4/level5',
    'level1/level2/level3/level4/level5/level6',

    'very-long-directory-name-that-tests-path-limits-and-may-require-pax-extensions',
    'very-long-directory-name-that-tests-path-limits-and-may-require-pax-extensions/another-very-long-subdirectory-name-for-comprehensive-testing',
    'very-long-directory-name-that-tests-path-limits-and-may-require-pax-extensions/another-very-long-subdirectory-name-for-comprehensive-testing/even-deeper-nesting',

    // Special characters and edge cases
    'spaces in names',
    'spaces in names/more spaces here',
    'spaces in names/more spaces here/final level',
    'special-chars-!@#$%^&*()',
    'special-chars-!@#$%^&*()/nested-special',
    'dots.and.periods',
    'dots.and.periods/more.dots.here',
    'unicode-测试-🚀-directory',
    'unicode-测试-🚀-directory/nested-unicode-文件夹',
    'unicode-测试-🚀-directory/nested-unicode-文件夹/深层目录',
  ];

  const content = new Uint8Array(1_024);
  crypto.getRandomValues(content);

  for (let i = 0; i < structures.length; i++) {
    yield TarFile.from([content], structures[i], {
      size: content.byteLength,
    });
  }
}

async function toTar(
  targetPath: string,
  content: Generator<TarFile>
): Promise<Buffer> {
  await pipeline(
    Readable.fromWeb(iterableToStream(tar(content)) as any),
    fs.createWriteStream(targetPath)
  );
  return await fs.promises.readFile(targetPath);
}

async function ungzip(targetPath: string): Promise<Buffer> {
  const stream = Readable.toWeb(fs.createReadStream(targetPath)).pipeThrough(
    new DecompressionStream('gzip') as any
  );
  const bytes = await new Response(stream as any).arrayBuffer();
  return Buffer.from(bytes);
}

export async function generate() {
  return {
    smallFiles: await toTar(
      path.join(tmpDir, 'small-files.tar'),
      generateSmallFiles()
    ),
    largeFiles: await toTar(
      path.join(tmpDir, 'large-files.tar'),
      generateLargeFiles()
    ),
    nestedFiles: await toTar(
      path.join(tmpDir, 'nested-files.tar'),
      generateNestedFiles()
    ),
    workerSample: await ungzip(path.join(__dirname, 'worker-sample.tar.gz')),
  };
}

export async function cleanup() {
  await Promise.all([
    fs.promises.rm(path.join(tmpDir, 'small-files.tar')),
    fs.promises.rm(path.join(tmpDir, 'large-files.tar')),
    fs.promises.rm(path.join(tmpDir, 'nested-files.tar')),
  ]);
}
