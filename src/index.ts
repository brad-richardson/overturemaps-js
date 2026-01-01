/**
 * @bradrichardson/overturemaps - Unofficial Overture Maps JavaScript/TypeScript Client
 *
 * Provides access to Overture Maps Foundation data via STAC catalog and GERS lookups.
 *
 * @packageDocumentation
 */

// STAC catalog functions
export { getStacCatalog, getLatestRelease, getAvailableReleases, clearCache } from './stac';
export type { StacCatalog, StacLink, StacRegistry } from './stac';

// GERS lookup functions
export { queryGersRegistry, getFeatureByGersId, closeDb } from './gers';

// Type definitions
export type {
  BoundingBox,
  OvertureType,
  Feature,
  Geometry,
  Point,
  MultiPoint,
  LineString,
  MultiLineString,
  Polygon,
  MultiPolygon,
  GeometryCollection,
  GersRegistryResult,
  ClientOptions,
} from './types';

export { typeThemeMap } from './types';

// Package version
export const version = '0.1.0';
