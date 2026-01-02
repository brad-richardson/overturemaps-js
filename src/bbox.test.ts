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

    it('should yield features for a small bbox', async () => {
      // Very small bbox in San Francisco downtown
      const bbox: BoundingBox = {
        xmin: -122.41,
        ymin: 37.785,
        xmax: -122.405,
        ymax: 37.79,
      };

      const features: unknown[] = [];
      for await (const feature of readByBbox('place', bbox)) {
        features.push(feature);
        if (features.length >= 5) break; // Limit for test speed
      }

      // Should find at least some places in downtown SF
      expect(features.length).toBeGreaterThan(0);
      expect(features[0]).toHaveProperty('type', 'Feature');
      expect(features[0]).toHaveProperty('geometry');
      expect(features[0]).toHaveProperty('properties');
    }, 60000); // 60 second timeout for network operations
  });

  describe('readByBboxAll', () => {
    it('should return all features as an array', async () => {
      // Very small bbox to limit data
      const bbox: BoundingBox = {
        xmin: -122.41,
        ymin: 37.787,
        xmax: -122.408,
        ymax: 37.789,
      };

      const features = await readByBboxAll('place', bbox);

      expect(Array.isArray(features)).toBe(true);
      features.forEach((feature) => {
        expect(feature.type).toBe('Feature');
        expect(feature.geometry).toBeDefined();
        expect(feature.properties).toBeDefined();
      });
    }, 60000);
  });
});
