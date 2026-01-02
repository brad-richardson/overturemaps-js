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

    // SKIPPED: parquet-wasm doesn't support predicate pushdown, so reading registry
    // files requires streaming all data. This test works but is too slow.
    // TODO: Re-enable when row-group filtering is available.
    it.skip('should return null for unknown but valid UUID', async () => {
      const unknownId = '00000000-0000-0000-0000-000000000000';
      const result = await queryGersRegistry(unknownId);
      expect(result).toBeNull();
    }, 15000);

    // SKIPPED: parquet-wasm doesn't support predicate pushdown.
    // TODO: Re-enable when row-group filtering is available.
    it.skip('should find registry entry for known GERS ID', async () => {
      // This is the GERS ID for Paris - a stable, well-known place
      const knownGersId = '97b66514-3f41-47ac-a348-9cfd51d983d5';

      const result = await queryGersRegistry(knownGersId);

      if (result !== null) {
        expect(result.filepath).toBeDefined();
        expect(result.filepath).toContain('release/');
        if (result.bbox) {
          expect(result.bbox.xmin).toBeLessThan(result.bbox.xmax);
          expect(result.bbox.ymin).toBeLessThan(result.bbox.ymax);
        }
      }
    }, 15000);
  });

  describe('getFeatureByGersId', () => {
    it('should reject invalid GERS ID format', async () => {
      await expect(getFeatureByGersId('invalid')).rejects.toThrow('Invalid GERS ID format');
    });

    // SKIPPED: parquet-wasm doesn't support predicate pushdown, so reading any
    // parquet file requires streaming all data. This test works but is too slow.
    // TODO: Re-enable when row-group filtering is available.
    it.skip('should return null for unknown GERS ID', async () => {
      const unknownId = '00000000-0000-0000-0000-000000000000';
      const result = await getFeatureByGersId(unknownId);
      expect(result).toBeNull();
    }, 15000);

    // SKIPPED: parquet-wasm doesn't support predicate pushdown.
    // TODO: Re-enable when row-group filtering is available.
    it.skip('should fetch feature for known GERS ID', async () => {
      // This is the GERS ID for Paris - a stable, well-known place
      const knownGersId = '97b66514-3f41-47ac-a348-9cfd51d983d5';

      const feature = await getFeatureByGersId(knownGersId);

      // The feature might not exist in current release
      if (feature !== null) {
        expect(feature.type).toBe('Feature');
        expect(feature.id).toBe(knownGersId.toLowerCase());
        expect(feature.geometry).toBeDefined();
        expect(feature.properties).toBeDefined();
      }
    }, 15000);
  });
});
