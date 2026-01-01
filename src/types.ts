/**
 * Type definitions for @brad/overturemaps
 * 
 * This file will contain all TypeScript interfaces and types
 * used throughout the library.
 */

/**
 * Geographic bounding box coordinates
 */
export interface BoundingBox {
  /** Western longitude (min longitude) */
  west: number;
  /** Southern latitude (min latitude) */
  south: number;
  /** Eastern longitude (max longitude) */
  east: number;
  /** Northern latitude (max latitude) */
  north: number;
}

/**
 * Supported Overture data types
 */
export type DataType = 
  | 'address'
  | 'base'
  | 'building'
  | 'division'
  | 'place'
  | 'transportation';

/**
 * Supported output formats
 */
export type OutputFormat = 
  | 'geojson'
  | 'geojsonseq'
  | 'geoparquet';

/**
 * Options for downloading Overture data
 */
export interface DownloadOptions {
  /** Type of data to download */
  type: DataType;
  /** Optional bounding box to filter data */
  bbox?: BoundingBox;
  /** Output format */
  format: OutputFormat;
  /** Output file path or writable stream */
  output?: string | NodeJS.WritableStream;
}

/**
 * Options for streaming Overture data
 */
export interface StreamOptions {
  /** Type of data to stream */
  type: DataType;
  /** Optional bounding box to filter data */
  bbox?: BoundingBox;
  /** Output format (defaults to geojson) */
  format?: OutputFormat;
}

/**
 * Client configuration options
 */
export interface ClientOptions {
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Connection timeout in milliseconds */
  connectionTimeout?: number;
  /** Skip STAC catalog and use S3 directly */
  skipCatalog?: boolean;
}

/**
 * GeoJSON Feature (simplified)
 * Full GeoJSON spec: https://tools.ietf.org/html/rfc7946
 */
export interface Feature {
  type: 'Feature';
  geometry: Geometry;
  properties: Record<string, any>;
  id?: string | number;
}

/**
 * GeoJSON Geometry (simplified)
 */
export interface Geometry {
  type: string;
  coordinates: any;
}

// TODO: Add more detailed type definitions as implementation progresses
// - STAC catalog types
// - Error types
// - Event types for progress tracking
// - Additional GeoJSON types
