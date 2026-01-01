/**
 * @bradrichardson/overturemaps - Unofficial Overture Maps JavaScript/TypeScript Client
 *
 * Provides access to Overture Maps Foundation data via STAC catalog and GERS lookups.
 * Works in both browser and Node.js environments using DuckDB-WASM.
 *
 * @packageDocumentation
 */

// STAC catalog functions
export { getStacCatalog, getLatestRelease, getAvailableReleases, clearCache } from './stac.js';
export type { StacCatalog, StacLink, StacRegistry } from './stac.js';

// GERS lookup functions
export { queryGersRegistry, getFeatureByGersId, closeDb } from './gers.js';

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
} from './types.js';

export { typeThemeMap } from './types.js';

// Package version
export const version = '0.1.3';
