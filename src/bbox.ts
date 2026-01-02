/**
 * Bounding box-based data retrieval for Overture Maps
 *
 * Allows fetching features by type within a geographic bounding box,
 * using STAC to discover intersecting files and hyparquet for efficient reading.
 */

import {
  asyncBufferFromUrl,
  cachedAsyncBuffer,
  parquetMetadataAsync,
  parquetQuery,
} from 'hyparquet';
import type { AsyncBuffer, FileMetaData } from 'hyparquet';
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
 * Get the collections.parquet URL for a release
 */
function getCollectionsParquetUrl(release: string): string {
  return `${STAC_BASE_URL}/${release}/collections.parquet`;
}

/**
 * Create an AsyncBuffer from a pre-fetched ArrayBuffer.
 * Used for files that need to be fully downloaded (e.g., from servers
 * that don't properly support HTTP range requests).
 */
function asyncBufferFromArrayBuffer(buffer: ArrayBuffer): AsyncBuffer {
  return {
    byteLength: buffer.byteLength,
    slice(start: number, end?: number): Promise<ArrayBuffer> {
      return Promise.resolve(buffer.slice(start, end));
    },
  };
}

/**
 * Fetch entire file and create an AsyncBuffer.
 * Used for STAC collections.parquet which may not support range requests properly.
 */
async function fetchFullFile(url: string): Promise<AsyncBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  return asyncBufferFromArrayBuffer(buffer);
}

/**
 * Create a cached AsyncBuffer for a URL.
 * Uses HTTP range requests and caches fetched byte ranges.
 */
async function getCachedFile(url: string): Promise<AsyncBuffer> {
  const file = await asyncBufferFromUrl({ url });
  return cachedAsyncBuffer(file);
}

/**
 * Check if two bounding boxes intersect
 */
function bboxIntersects(a: BoundingBox, b: BoundingBox): boolean {
  return a.xmin < b.xmax && a.xmax > b.xmin && a.ymin < b.ymax && a.ymax > b.ymin;
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

  let file: AsyncBuffer;
  let metadata: FileMetaData;

  try {
    // Use full file fetch for STAC collections.parquet as the server may not
    // properly support HTTP range requests
    file = await fetchFullFile(collectionsUrl);
    metadata = await parquetMetadataAsync(file);
  } catch (error) {
    throw new Error(
      `Failed to fetch STAC collections index: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Query for items that match our type and intersect with bbox
  const rows = (await parquetQuery({
    file,
    metadata,
    columns: ['collection', 'type', 'bbox', 'assets'],
  })) as StacCollectionItem[];

  // Filter by type and bbox intersection
  const intersectingFiles: string[] = [];

  for (const row of rows) {
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
 * Read features from a single parquet file, filtering by bbox.
 *
 * @param filePath - Path to the parquet file (relative to S3 bucket)
 * @param bbox - Optional bounding box to filter features
 * @returns Array of features from the file
 */
async function readFeaturesFromFile(
  filePath: string,
  bbox?: BoundingBox
): Promise<Feature[]> {
  const url = `${S3_BASE_URL}/${filePath}`;

  let file: AsyncBuffer;
  let metadata: FileMetaData;

  try {
    file = await getCachedFile(url);
    metadata = await parquetMetadataAsync(file);
  } catch (error) {
    throw new Error(
      `Failed to read parquet file ${filePath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Query all rows from the file
  const rows = (await parquetQuery({
    file,
    metadata,
  })) as Record<string, unknown>[];

  const features: Feature[] = [];

  for (const row of rows) {
    // Extract and validate bbox from the row
    const rowBbox = row.bbox as {
      xmin?: number;
      ymin?: number;
      xmax?: number;
      ymax?: number;
    } | null;

    // Apply bbox filter if provided
    if (bbox) {
      // Skip features with incomplete bbox data
      if (
        !rowBbox ||
        rowBbox.xmin == null ||
        rowBbox.ymin == null ||
        rowBbox.xmax == null ||
        rowBbox.ymax == null
      ) {
        continue;
      }

      const featureBbox: BoundingBox = {
        xmin: rowBbox.xmin,
        ymin: rowBbox.ymin,
        xmax: rowBbox.xmax,
        ymax: rowBbox.ymax,
      };

      if (!bboxIntersects(bbox, featureBbox)) {
        continue;
      }
    }

    // Build properties from all columns except geometry and bbox
    const properties: Record<string, unknown> = {};
    for (const key of Object.keys(row)) {
      if (key !== 'geometry' && key !== 'bbox') {
        properties[key] = row[key];
      }
    }

    // Get geometry (hyparquet automatically converts WKB to GeoJSON for GeoParquet files)
    const geometry = row.geometry as Geometry | undefined;
    if (!geometry) {
      continue; // Skip features without valid geometry
    }

    // Build the feature
    const feature: Feature = {
      type: 'Feature',
      id: row.id as string | undefined,
      geometry,
      properties,
    };

    // Add bbox if available
    if (
      rowBbox &&
      rowBbox.xmin != null &&
      rowBbox.ymin != null &&
      rowBbox.xmax != null &&
      rowBbox.ymax != null
    ) {
      feature.bbox = [rowBbox.xmin, rowBbox.ymin, rowBbox.xmax, rowBbox.ymax];
    }

    features.push(feature);
  }

  return features;
}

/**
 * Read Overture features by type within a bounding box.
 *
 * This function discovers relevant parquet files using the STAC index,
 * then reads and filters features that intersect with the given bounding box.
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

  // Read features from each file (fail-fast: stops on first error)
  let count = 0;
  for (const filePath of filePaths) {
    const features = await readFeaturesFromFile(filePath, bbox);
    for (const feature of features) {
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
