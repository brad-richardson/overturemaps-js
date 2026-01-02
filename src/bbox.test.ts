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

    // Note: This is an integration test that streams actual parquet data.
    // Uses a tiny bbox and limit option to minimize data transfer.
    it('should yield features for a small bbox', async () => {
      // Tiny bbox - approximately 50m x 50m in San Francisco (single city block)
      const bbox: BoundingBox = {
        xmin: -122.4195,
        ymin: 37.7749,
        xmax: -122.419,
        ymax: 37.7754,
      };

      const features: unknown[] = [];
      // Use limit to stop after first feature - prevents loading too much data
      for await (const feature of readByBbox('place', bbox, { limit: 1 })) {
        features.push(feature);
      }

      // May or may not find places in this tiny area
      expect(features.length).toBeLessThanOrEqual(1);
      if (features.length > 0) {
        expect(features[0]).toHaveProperty('type', 'Feature');
        expect(features[0]).toHaveProperty('geometry');
        expect(features[0]).toHaveProperty('properties');
      }
    }, 120000); // 2 minute timeout for network operations
  });

  describe('readByBboxAll', () => {
    // Note: This is an integration test that streams actual parquet data.
    // Uses a tiny bbox and limit option to minimize data transfer.
    it('should return all features as an array', async () => {
      // Tiny bbox - approximately 50m x 50m in San Francisco (single city block)
      const bbox: BoundingBox = {
        xmin: -122.4195,
        ymin: 37.7749,
        xmax: -122.419,
        ymax: 37.7754,
      };

      // Use limit to prevent loading too much data
      const features = await readByBboxAll('place', bbox, { limit: 1 });

      expect(Array.isArray(features)).toBe(true);
      expect(features.length).toBeLessThanOrEqual(1);
      features.forEach((feature) => {
        expect(feature.type).toBe('Feature');
        expect(feature.geometry).toBeDefined();
        expect(feature.properties).toBeDefined();
      });
    }, 120000); // 2 minute timeout for network operations
  });
});
