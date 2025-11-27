import { describe, it, expect } from 'vitest';
import { StreamFile } from '../file';

describe('StreamFile', () => {
  it('extends File', async () => {
    const file = new StreamFile([], '', {});
    expect(file).toBeInstanceOf(File);
  });
});
