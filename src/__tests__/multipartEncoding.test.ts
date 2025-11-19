import { describe, it, expect } from 'vitest';
import { encodeName, decodeName } from '../multipartEncoding';

describe('encodeName', () => {
  it('escapes backslashes', () => {
    expect(encodeName(' \\ ')).toBe(' \\\\ ');
  });

  it('encodes quotes and newlines', () => {
    expect(encodeName(' " \n ')).toBe(' %22 %0A ');
  });

  it('leaves other special characters alone', () => {
    expect(encodeName('!@$%&;')).toBe('!@$%&;');
  });
});

describe('decodeName', () => {
  it('unescpaes escaped control codes', () => {
    expect(decodeName(' \\n \\b \\f \\n \\r \\t ')).toBe(' \n \b \f \n \r \t ');
  });

  it('decodes unicode sequences', () => {
    expect(decodeName('\\u8595')).toBe('\u8595');
  });

  it('decodes hex sequences', () => {
    expect(decodeName('\\x22')).toBe('\x22');
  });

  it('decodes percentage encoded characters', () => {
    expect(decodeName('%22%0A')).toBe('"\n');
  });
});
