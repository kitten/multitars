import { describe, it, expect } from 'vitest';
import { iterableToStream } from '../conversions';

describe('safeIteratorToStream', () => {
  it('should propagate errors to an AbortSignal (start errors)', async () => {
    const body = iterableToStream(
      (async function* gen() {
        throw new Error('ohno');
      })()
    );

    try {
      for await (const _chunk of body) {
      }
      expect.fail('Expected stream to error');
    } catch (error: any) {
      expect(error.message).toMatch('ohno');
      expect(body.signal.aborted).toBe(true);
      expect(() => body.signal.throwIfAborted()).toThrow('ohno');
    }
  });

  it('should propagate errors to an AbortSignal (yield errors)', async () => {
    const body = iterableToStream(
      (async function* gen() {
        yield new Uint8Array(0);
        throw new Error('ohno');
      })()
    );

    try {
      for await (const _chunk of body) {
      }
      expect.fail('Expected stream to error');
    } catch (error: any) {
      expect(error.message).toMatch('ohno');
      expect(body.signal.aborted).toBe(true);
      expect(() => body.signal.throwIfAborted()).toThrow('ohno');
    }
  });

  it('should not propagate cancellation', async () => {
    const body = iterableToStream(
      (async function* gen() {
        yield new Uint8Array(0);
        throw new Error('ohno');
      })()
    );

    for await (const _chunk of body) {
      break;
    }

    expect(body.signal.aborted).toBe(false);
  });

  it('should not back-propagate unexpected errors', async () => {
    const body = iterableToStream(
      (async function* gen() {
        while (true) yield new Uint8Array(0);
      })()
    );

    try {
      for await (const _chunk of body) {
        throw new Error('ohno');
      }
    } catch (error) {
      expect(body.signal.aborted).toBe(false);
    }
  });

  it('should cancel if input signal also cancels', async () => {
    const controller = new AbortController();
    const body = iterableToStream(
      (async function* gen() {
        while (true) yield new Uint8Array(0);
      })(),
      { signal: controller.signal }
    );

    try {
      for await (const _chunk of body) {
        controller.abort(new Error('ohno'));
      }
      expect.fail('Expected stream to error');
    } catch (error) {
      expect(body.signal.aborted).toBe(true);
      expect(() => body.signal.throwIfAborted()).toThrow('ohno');
    }
  });
});
