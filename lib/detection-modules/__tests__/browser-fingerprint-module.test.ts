import { browserFingerprintModule } from '../browser-fingerprint-module';

describe('browserFingerprintModule', () => {
  it('returns success with the expected shape under jsdom', async () => {
    const result = await browserFingerprintModule.detect();
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    const data = result.data!;
    expect(typeof data.userAgent).toBe('string');
    expect(typeof data.language).toBe('string');
    expect(Array.isArray(data.languages)).toBe(true);
    expect(typeof data.platform).toBe('string');
    expect(typeof data.cookieEnabled).toBe('boolean');
    expect(typeof data.onlineStatus).toBe('boolean');
    expect(typeof data.hardwareConcurrency).toBe('number');
    expect(data.screenResolution).toMatchObject({
      width: expect.any(Number),
      height: expect.any(Number),
      colorDepth: expect.any(Number),
      pixelDepth: expect.any(Number),
    });
    expect(typeof data.timezone.name).toBe('string');
    expect(typeof data.timezone.offset).toBe('number');
    expect(result.metadata?.pluginCount).toBe(data.plugins.length);
  });
});
