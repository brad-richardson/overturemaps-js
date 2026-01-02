/**
 * Bounding box-based data retrieval for Overture Maps
 *
 * Allows fetching features by type within a geographic bounding box,
 * using STAC to discover intersecting files and parquet-wasm for efficient reading.
 */

import { tableFromIPC } from 'apache-arrow';
import type { Table as ArrowTable, StructRowProxy } from 'apache-arrow';
import * as parquetWasm from 'parquet-wasm/esm';
import wkx from 'wkx';
import { getLatestRelease } from './stac.js';
import type { BoundingBox, Feature, Geometry, OvertureType } from './types.js';

const S3_BASE_URL = 'https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com';
const STAC_BASE_URL = 'https://stac.overturemaps.org';

/**
 * Asset entry in the STAC collections.parquet
 */
interface StacAsset {
  href: string;
  type?: string;
}

/**
 * STAC collection item structure from collections.parquet
 */
interface StacCollectionItem {
  collection: string;
  type: string;
  bbox: {
    xmin: number;
    ymin: number;
    xmax: number;
    ymax: number;
  };
  assets: {
    'aws-https'?: StacAsset;
    'aws-s3'?: StacAsset;
    'azure-https'?: StacAsset;
    [key: string]: StacAsset | undefined;
  };
}

/**
 * Options for readByBbox
 */
export interface ReadByBboxOptions {
  /** Maximum number of features to return. If not specified, all features are returned. */
  limit?: number;
}

/**
 * Track WASM initialization state
 */
let wasmInitialized = false;

/**
 * Initialize parquet-wasm
 * In Node.js, we need to load the WASM file from disk since fetch doesn't support file:// URLs.
 * In browsers, the default init fetches it automatically.
 */
async function ensureWasmInitialized(): Promise<void> {
  if (wasmInitialized) return;

  if (typeof parquetWasm.default === 'function') {
    // Check if we're in Node.js
    if (typeof process !== 'undefined' && process.versions?.node) {
      // In Node.js, load WASM from file system using require.resolve
      const { readFile } = await import('node:fs/promises');
      const { createRequire } = await import('node:module');
      const require = createRequire(import.meta.url);
      const wasmPath = require.resolve('parquet-wasm/esm/parquet_wasm_bg.wasm');
      const wasmBytes = await readFile(wasmPath);
      await parquetWasm.default(wasmBytes);
    } else {
      // In browser, use default fetch-based initialization
      await parquetWasm.default();
    }
  }
  wasmInitialized = true;
}

/**
 * Get the collections.parquet URL for a release
 */
function getCollectionsParquetUrl(release: string): string {
  return `${STAC_BASE_URL}/${release}/collections.parquet`;
}

/**
 * Check if two bounding boxes intersect
 */
function bboxIntersects(a: BoundingBox, b: BoundingBox): boolean {
  return a.xmin < b.xmax && a.xmax > b.xmin && a.ymin < b.ymax && a.ymax > b.ymin;
}

/**
 * Read a parquet file from URL and return all rows as objects.
 * Uses parquet-wasm for consistent handling.
 */
async function readParquetFromUrl(url: string): Promise<Record<string, unknown>[]> {
  await ensureWasmInitialized();

  // For STAC files, we need to fetch the full file since the server may not support range requests
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();

  // Read parquet data
  const table = parquetWasm.readParquet(new Uint8Array(buffer));
  const ipcStream = table.intoIPCStream();
  const arrowTable: ArrowTable = tableFromIPC(ipcStream);

  // Convert to array of objects
  const rows: Record<string, unknown>[] = [];
  for (const row of arrowTable) {
    rows.push(row.toJSON() as Record<string, unknown>);
  }
  return rows;
}

/**
 * Get files from STAC that intersect with the given bounding box.
 *
 * This is an advanced/low-level function that queries the STAC collections.parquet
 * index to find data files whose spatial extent overlaps with the provided bounding box.
 * Most users should use {@link readByBbox} or {@link readByBboxAll} instead.
 *
 * @param overtureType - The Overture feature type
 * @param bbox - Bounding box to filter by
 * @param release - Release version string (e.g., "2024-12-18.0")
 * @returns List of S3 file paths that intersect with the bbox
 */
export async function getFilesFromStac(
  overtureType: OvertureType,
  bbox: BoundingBox,
  release: string
): Promise<string[]> {
  const collectionsUrl = getCollectionsParquetUrl(release);

  let rows: Record<string, unknown>[];
  try {
    rows = await readParquetFromUrl(collectionsUrl);
  } catch (error) {
    throw new Error(
      `Failed to fetch STAC collections index: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Filter by type and bbox intersection
  const intersectingFiles: string[] = [];

  for (const row of rows as unknown as StacCollectionItem[]) {
    // Check if this is a Feature item for our collection type
    if (row.collection !== overtureType || row.type !== 'Feature') {
      continue;
    }

    // Check bbox intersection
    if (
      row.bbox &&
      bboxIntersects(bbox, {
        xmin: row.bbox.xmin,
        ymin: row.bbox.ymin,
        xmax: row.bbox.xmax,
        ymax: row.bbox.ymax,
      })
    ) {
      // Extract path from assets - prefer aws-https, fall back to aws-s3
      const asset = row.assets?.['aws-https'] || row.assets?.['aws-s3'];
      if (asset?.href) {
        // Convert URL to relative path
        const path = asset.href
          .replace('https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com/', '')
          .replace('s3://overturemaps-us-west-2/', '');
        intersectingFiles.push(path);
      }
    }
  }

  return intersectingFiles;
}

/**
 * Convert WKB bytes to GeoJSON geometry
 */
function wkbToGeoJSON(wkbBytes: Uint8Array): Geometry | null {
  try {
    const buffer = Buffer.from(wkbBytes);
    const geometry = wkx.Geometry.parse(buffer);
    return geometry.toGeoJSON() as Geometry;
  } catch {
    return null;
  }
}

/**
 * Convert an Arrow row to a GeoJSON Feature
 */
function arrowRowToFeature(row: StructRowProxy, queryBbox: BoundingBox): Feature | null {
  // Get bbox from the row
  const rowBbox = row.bbox as { xmin?: number; ymin?: number; xmax?: number; ymax?: number } | null;

  // Check bbox intersection
  if (
    !rowBbox ||
    rowBbox.xmin == null ||
    rowBbox.ymin == null ||
    rowBbox.xmax == null ||
    rowBbox.ymax == null
  ) {
    return null;
  }

  if (
    !bboxIntersects(queryBbox, {
      xmin: rowBbox.xmin,
      ymin: rowBbox.ymin,
      xmax: rowBbox.xmax,
      ymax: rowBbox.ymax,
    })
  ) {
    return null;
  }

  // Get geometry (WKB bytes)
  const geometryBytes = row.geometry as Uint8Array | null;
  if (!geometryBytes) {
    return null;
  }

  const geometry = wkbToGeoJSON(geometryBytes);
  if (!geometry) {
    return null;
  }

  // Build properties from all columns except geometry and bbox
  const properties: Record<string, unknown> = {};
  const rowObj = row.toJSON() as Record<string, unknown>;
  for (const key of Object.keys(rowObj)) {
    if (key !== 'geometry' && key !== 'bbox') {
      properties[key] = rowObj[key];
    }
  }

  // Build the feature
  const feature: Feature = {
    type: 'Feature',
    id: row.id as string | undefined,
    geometry,
    properties,
    bbox: [rowBbox.xmin, rowBbox.ymin, rowBbox.xmax, rowBbox.ymax],
  };

  return feature;
}

/**
 * Read features from a single parquet file using parquet-wasm streaming.
 * Yields record batches as they are read, similar to Python's record_batch_reader.
 *
 * @param filePath - Path to the parquet file (relative to S3 bucket)
 * @param bbox - Bounding box to filter features
 * @param limit - Optional limit on number of rows to read from parquet
 * @returns Async generator yielding features from the file
 */
async function* readFeaturesFromFileStream(
  filePath: string,
  bbox: BoundingBox,
  limit?: number
): AsyncGenerator<Feature, void, unknown> {
  const url = `${S3_BASE_URL}/${filePath}`;

  await ensureWasmInitialized();

  // Open the parquet file from URL (uses HTTP range requests)
  const parquetFile = await parquetWasm.ParquetFile.fromUrl(url);

  try {
    // Get a stream of record batches
    const stream = await parquetFile.stream({
      batchSize: 1024, // Process 1024 rows at a time
      concurrency: 4, // Concurrent HTTP requests
      limit, // Native limit support in parquet-wasm
    });

    // Use reader to iterate over the stream (ReadableStream doesn't have async iterator in all environments)
    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value: wasmRecordBatch } = await reader.read();
        if (done) break;

        // Convert WASM RecordBatch to Arrow JS Table
        const ipcStream = wasmRecordBatch.intoIPCStream();
        const arrowTable: ArrowTable = tableFromIPC(ipcStream);

        // Iterate through rows in the batch
        for (const row of arrowTable) {
          const feature = arrowRowToFeature(row, bbox);
          if (feature) {
            yield feature;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  } finally {
    // Clean up WASM resources
    parquetFile.free();
  }
}

/**
 * Read Overture features by type within a bounding box.
 *
 * This function discovers relevant parquet files using the STAC index,
 * then streams record batches from each file, similar to Python's record_batch_reader.
 *
 * Note: This function uses fail-fast error handling. If reading any file fails,
 * the entire operation stops and throws an error. Partial results are not returned.
 *
 * @param overtureType - The Overture feature type to query
 * @param bbox - Geographic bounding box to filter by
 * @param options - Optional configuration including limit
 * @returns Async generator yielding features within the bounding box
 * @throws Error if the release cannot be fetched, STAC index fails, or any file read fails
 *
 * @example
 * ```typescript
 * const bbox = { xmin: -122.5, ymin: 37.7, xmax: -122.3, ymax: 37.9 };
 *
 * for await (const feature of readByBbox('place', bbox)) {
 *   console.log(feature.properties.names);
 * }
 *
 * // Limit results to first 100 features
 * for await (const feature of readByBbox('place', bbox, { limit: 100 })) {
 *   console.log(feature.properties.names);
 * }
 *
 * // Or collect all features into an array
 * const features = await Array.fromAsync(readByBbox('building', bbox));
 * ```
 */
export async function* readByBbox(
  overtureType: OvertureType,
  bbox: BoundingBox,
  options: ReadByBboxOptions = {}
): AsyncGenerator<Feature, void, unknown> {
  const { limit } = options;

  // Validate bbox
  if (bbox.xmin >= bbox.xmax || bbox.ymin >= bbox.ymax) {
    throw new Error(
      'Invalid bounding box: xmin must be less than xmax, ymin must be less than ymax'
    );
  }

  // Get the latest release
  let release: string;
  try {
    release = await getLatestRelease();
  } catch (error) {
    throw new Error(
      `Failed to get latest release: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Use STAC index to find files that intersect with bbox
  const filePaths = await getFilesFromStac(overtureType, bbox, release);

  if (filePaths.length === 0) {
    return; // No intersecting files found
  }

  // Stream features from each file
  let count = 0;
  for (const filePath of filePaths) {
    // Calculate remaining limit for this file
    const remainingLimit = limit !== undefined ? limit - count : undefined;

    for await (const feature of readFeaturesFromFileStream(filePath, bbox, remainingLimit)) {
      yield feature;
      count++;
      if (limit !== undefined && count >= limit) {
        return; // Reached limit
      }
    }
  }
}

/**
 * Read all Overture features by type within a bounding box.
 *
 * This is a convenience function that collects all features from the
 * async generator into an array.
 *
 * Note: This function uses fail-fast error handling. If reading any file fails,
 * the entire operation stops and throws an error. Partial results are not returned.
 *
 * @param overtureType - The Overture feature type to query
 * @param bbox - Geographic bounding box to filter by
 * @param options - Optional configuration including limit
 * @returns Promise resolving to array of features within the bounding box
 * @throws Error if the release cannot be fetched, STAC index fails, or any file read fails
 *
 * @example
 * ```typescript
 * const bbox = { xmin: -122.5, ymin: 37.7, xmax: -122.3, ymax: 37.9 };
 * const places = await readByBboxAll('place', bbox);
 * console.log(`Found ${places.length} places`);
 *
 * // Limit to first 50 features
 * const limitedPlaces = await readByBboxAll('place', bbox, { limit: 50 });
 * ```
 */
export async function readByBboxAll(
  overtureType: OvertureType,
  bbox: BoundingBox,
  options: ReadByBboxOptions = {}
): Promise<Feature[]> {
  const features: Feature[] = [];
  for await (const feature of readByBbox(overtureType, bbox, options)) {
    features.push(feature);
  }
  return features;
}
