import { describe, test, expect } from '@jest/globals';
import { getChannelFromUserAgent } from '../../../src/utils/posthog';

describe('posthog getChannelFromUserAgent', () => {
  test("should return 'web' when userAgent includes 'mozilla'", () => {
    const userAgent =
      'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.5563.115 Mobile Safari/537.36';
    const channel = getChannelFromUserAgent(userAgent);
    expect(channel).toBe('web');
  });

  test("should return 'cli'", () => {
    const userAgent = 'cli';
    const channel = getChannelFromUserAgent(userAgent);
    expect(channel).toBe('cli');
  });

  test("should return 'k8-operator'", () => {
    const userAgent = 'k8-operator';
    const channel = getChannelFromUserAgent(userAgent);
    expect(channel).toBe('k8-operator');
  });

  test('should return undefined if no userAgent', () => {
    const userAgent = undefined;
    const channel = getChannelFromUserAgent(userAgent);
    expect(channel).toBe('other');
  });
});
