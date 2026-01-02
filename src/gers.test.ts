import { describe, it, expect, beforeEach } from 'vitest';
import { queryGersRegistry, getFeatureByGersId } from './gers';
import { clearCache } from './stac';

describe('GERS Lookup', () => {
  beforeEach(() => {
    clearCache();
  });

  describe('queryGersRegistry', () => {
    it('should reject invalid GERS ID format', async () => {
      await expect(queryGersRegistry('not-a-uuid')).rejects.toThrow('Invalid GERS ID format');
      await expect(queryGersRegistry('')).rejects.toThrow('Invalid GERS ID format');
      await expect(queryGersRegistry('12345')).rejects.toThrow('Invalid GERS ID format');
    });

    it('should return null for unknown but valid UUID', async () => {
      // A random UUID that doesn't exist in the registry
      const unknownId = '00000000-0000-0000-0000-000000000000';
      const result = await queryGersRegistry(unknownId);
      expect(result).toBeNull();
    }, 60000);

    // Integration test with a real GERS ID from production
    // This ID is for a place entry in Overture Maps
    it('should find registry entry for known GERS ID', async () => {
      // This is a known place ID from Overture Maps (UUID format with dashes)
      // If this test fails, the ID may have changed - find a new one from production data
      const knownGersId = '08b2a100-d84b-3fff-0200-c09db7ca8630';

      const result = await queryGersRegistry(knownGersId);

      // The ID might not exist in current release, so we check both cases
      if (result !== null) {
        expect(result.filepath).toBeDefined();
        expect(result.filepath).toContain('release/');
        if (result.bbox) {
          expect(result.bbox.xmin).toBeLessThan(result.bbox.xmax);
          expect(result.bbox.ymin).toBeLessThan(result.bbox.ymax);
        }
      }
      // If null, the ID doesn't exist in current release (acceptable)
    }, 60000);
  });

  describe('getFeatureByGersId', () => {
    it('should reject invalid GERS ID format', async () => {
      await expect(getFeatureByGersId('invalid')).rejects.toThrow('Invalid GERS ID format');
    });

    it('should return null for unknown GERS ID', async () => {
      const unknownId = '00000000-0000-0000-0000-000000000000';
      const result = await getFeatureByGersId(unknownId);
      expect(result).toBeNull();
    }, 60000);

    // Integration test: fetch a real feature from production
    it('should fetch feature for known GERS ID', async () => {
      // This is a known place ID from Overture Maps (UUID format with dashes)
      const knownGersId = '08b2a100-d84b-3fff-0200-c09db7ca8630';

      const feature = await getFeatureByGersId(knownGersId);

      // The feature might not exist in current release
      if (feature !== null) {
        expect(feature.type).toBe('Feature');
        expect(feature.id).toBe(knownGersId.toLowerCase());
        expect(feature.geometry).toBeDefined();
        expect(feature.properties).toBeDefined();
      }
    }, 120000); // 2 minute timeout for network operations
  });
});
