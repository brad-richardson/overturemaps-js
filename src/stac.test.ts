import { describe, it, expect, beforeEach } from 'vitest';
import { getLatestRelease, getAvailableReleases, clearCache } from './stac';

describe('STAC', () => {
  beforeEach(() => {
    clearCache();
  });

  it('should fetch the latest release', async () => {
    const release = await getLatestRelease();
    expect(release).toBeDefined();
    expect(typeof release).toBe('string');
    // Release format is like "2024-12-18.0"
    expect(release).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
  });

  it('should fetch available releases', async () => {
    const [releases, latest] = await getAvailableReleases();
    expect(Array.isArray(releases)).toBe(true);
    expect(releases.length).toBeGreaterThan(0);
    expect(latest).toBeDefined();
    expect(releases).toContain(latest);
  });
});
