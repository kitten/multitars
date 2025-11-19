import { describe, it, expect } from 'vitest';

import { tar } from '../tarOutput';
import { untar } from '../tarInput';
import { TarFile } from '../tarShared';
import { iteratorToStream, streamToBuffer } from './utils';

describe('tar', () => {
  describe('tested via untar()', () => {
    it('compresses a single file readable by untar', async () => {
      const NOW = 1751629979000;

      const tarStream = tar(
        (async function* () {
          const file = new Blob(['hello world!']);
          yield TarFile.from(file.stream(), 'test-file.txt', {
            lastModified: NOW,
            size: file.size,
          });
        })()
      );

      const binaryOutput = await streamToBuffer(iteratorToStream(tarStream));
      expect(Buffer.from(binaryOutput).toString('hex')).toMatchSnapshot();

      const entries: any[] = [];
      const blob = new Blob([binaryOutput]);
      for await (const entry of untar(blob.stream())) {
        entries.push({
          name: entry.name,
          size: entry.size,
          lastModified: entry.lastModified,
          text: await entry.text(),
        });
      }

      expect(entries).toEqual([
        {
          name: 'test-file.txt',
          size: 12,
          text: 'hello world!',
          lastModified: NOW,
        },
      ]);
    });

    it('compresses a single file with a longer name readable by untar', async () => {
      const NOW = Math.floor(new Date().valueOf() / 1000) * 1000;
      const NAME = `${'d'.repeat(100)}/${'x'.repeat(50)}.txt`;

      const tarStream = tar(
        (async function* () {
          const file = new Blob(['hello world!']);
          yield TarFile.from(file.stream(), NAME, {
            lastModified: NOW,
            size: file.size,
          });
        })()
      );

      const entries: any[] = [];
      for await (const entry of untar(iteratorToStream(tarStream))) {
        entries.push({
          name: entry.name,
          size: entry.size,
          lastModified: entry.lastModified,
          text: await entry.text(),
        });
      }

      expect(entries).toEqual([
        {
          name: NAME,
          size: 12,
          text: 'hello world!',
          lastModified: NOW,
        },
      ]);
    });

    it('compresses a single file with a very long name readable by untar', async () => {
      const NOW = Math.floor(new Date().valueOf() / 1000) * 1000;
      const NAME = `${'d'.repeat(300)}/${'x'.repeat(200)}.txt`;

      const tarStream = tar(
        (async function* () {
          const file = new Blob(['hello world!']);
          yield TarFile.from(file.stream(), NAME, {
            lastModified: NOW,
            size: file.size,
          });
        })()
      );

      const entries: any[] = [];
      for await (const entry of untar(iteratorToStream(tarStream))) {
        entries.push({
          name: entry.name,
          size: entry.size,
          lastModified: entry.lastModified,
          text: await entry.text(),
        });
      }

      expect(entries).toEqual([
        {
          name: NAME,
          size: 12,
          text: 'hello world!',
          lastModified: NOW,
        },
      ]);
    });
  });
});
