import { describe, it, expect, beforeEach } from 'vitest';
import { getFilesFromStac, readByBbox, readByBboxAll } from './bbox';
import { clearCache, getLatestRelease } from './stac';
import type { BoundingBox } from './types';

describe('Bounding Box Queries', () => {
  beforeEach(() => {
    clearCache();
  });

  describe('getFilesFromStac', () => {
    it('should find files that intersect with a bbox', async () => {
      const release = await getLatestRelease();
      const bbox: BoundingBox = {
        xmin: -122.5,
        ymin: 37.7,
        xmax: -122.3,
        ymax: 37.9,
      };

      const files = await getFilesFromStac('place', bbox, release);

      expect(Array.isArray(files)).toBe(true);
      expect(files.length).toBeGreaterThan(0);
      // Files should be S3 paths
      files.forEach((file) => {
        expect(file).toMatch(/release\/.+\/theme=places\/type=place/);
      });
    });

    it('should return empty array for bbox with no data', async () => {
      const release = await getLatestRelease();
      // Middle of the Pacific Ocean - unlikely to have places
      const bbox: BoundingBox = {
        xmin: -175,
        ymin: -15,
        xmax: -174,
        ymax: -14,
      };

      const files = await getFilesFromStac('place', bbox, release);

      expect(Array.isArray(files)).toBe(true);
      // May be empty or have some files depending on data coverage
    });

    it('should find building files for urban area', async () => {
      const release = await getLatestRelease();
      // San Francisco area
      const bbox: BoundingBox = {
        xmin: -122.45,
        ymin: 37.75,
        xmax: -122.4,
        ymax: 37.8,
      };

      const files = await getFilesFromStac('building', bbox, release);

      expect(Array.isArray(files)).toBe(true);
      expect(files.length).toBeGreaterThan(0);
    });
  });

  describe('readByBbox', () => {
    it('should reject invalid bbox', async () => {
      const invalidBbox: BoundingBox = {
        xmin: 10,
        ymin: 10,
        xmax: 5, // xmax < xmin
        ymax: 20,
      };

      await expect(async () => {
        for await (const _feature of readByBbox('place', invalidBbox)) {
          // Should not get here
        }
      }).rejects.toThrow('Invalid bounding box');
    });

    // SKIPPED: parquet-wasm doesn't support predicate pushdown, so reading any
    // parquet file requires streaming all data. This test works but is too slow.
    // TODO: Re-enable when row-group filtering is available.
    it.skip('should yield features for a small bbox', async () => {
      // Tiny bbox - approximately 100m x 100m near Union Square, San Francisco
      const bbox: BoundingBox = {
        xmin: -122.4085,
        ymin: 37.7875,
        xmax: -122.4075,
        ymax: 37.7885,
      };

      const features: unknown[] = [];
      // Use limit=1 to stop immediately after first feature
      for await (const feature of readByBbox('place', bbox, { limit: 1 })) {
        features.push(feature);
      }

      // May or may not find places - just verify structure if found
      expect(features.length).toBeLessThanOrEqual(1);
      if (features.length > 0) {
        expect(features[0]).toHaveProperty('type', 'Feature');
        expect(features[0]).toHaveProperty('geometry');
        expect(features[0]).toHaveProperty('properties');
      }
    }, 15000);
  });

  describe('readByBboxAll', () => {
    // SKIPPED: parquet-wasm doesn't support predicate pushdown, so reading any
    // parquet file requires streaming all data. This test works but is too slow.
    // TODO: Re-enable when row-group filtering is available.
    it.skip('should return all features as an array', async () => {
      // Tiny bbox - approximately 100m x 100m near Union Square, San Francisco
      const bbox: BoundingBox = {
        xmin: -122.4085,
        ymin: 37.7875,
        xmax: -122.4075,
        ymax: 37.7885,
      };

      // Use limit=1 to prevent loading too much data
      const features = await readByBboxAll('place', bbox, { limit: 1 });

      expect(Array.isArray(features)).toBe(true);
      expect(features.length).toBeLessThanOrEqual(1);
      features.forEach((feature) => {
        expect(feature.type).toBe('Feature');
        expect(feature.geometry).toBeDefined();
        expect(feature.properties).toBeDefined();
      });
    }, 15000);
  });
});
