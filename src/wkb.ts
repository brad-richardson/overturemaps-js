/**
 * WKB (Well-Known Binary) parsing utilities
 *
 * Provides WKB to GeoJSON conversion using @loaders.gl/wkt.
 * Works in both browser and Node.js environments.
 */

import { WKBLoader } from '@loaders.gl/wkt';
import { parseSync } from '@loaders.gl/core';
import type { Geometry } from './types.js';

/**
 * Convert WKB bytes to GeoJSON geometry.
 *
 * @param wkbBytes - Well-Known Binary geometry data
 * @returns GeoJSON Geometry object, or null if parsing fails
 */
export function wkbToGeoJSON(wkbBytes: Uint8Array): Geometry | null {
  try {
    // WKBLoader defaults to 'geojson-geometry' shape output
    // Copy to a new ArrayBuffer to ensure we have an ArrayBuffer (not SharedArrayBuffer)
    const buffer = new Uint8Array(wkbBytes).buffer as ArrayBuffer;
    const geometry = parseSync(buffer, WKBLoader);
    return geometry as Geometry;
  } catch (error) {
    console.warn('Failed to parse WKB geometry:', error instanceof Error ? error.message : error);
    return null;
  }
}
