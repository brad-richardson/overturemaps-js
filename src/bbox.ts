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
  assets: string;
}

/**
 * Options for readByBbox
 */
export interface ReadByBboxOptions {
  /** Use STAC index to filter files by bbox (recommended for large datasets) */
  useStacIndex?: boolean;
}

/**
 * Get the collections.parquet URL for a release
 */
function getCollectionsParquetUrl(release: string): string {
  return `${STAC_BASE_URL}/${release}/collections.parquet`;
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
 * Reads the collections.parquet file to find data files whose spatial extent
 * overlaps with the provided bounding box.
 *
 * @param overtureType - The Overture feature type
 * @param bbox - Bounding box to filter by
 * @param release - Release version
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
    file = await getCachedFile(collectionsUrl);
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
      // Extract path from assets (format: s3://bucket/path)
      const s3Path = row.assets;
      if (s3Path) {
        // Convert s3:// URL to HTTPS URL
        const path = s3Path.replace('s3://overturemaps-us-west-2/', '');
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
    if (bbox && rowBbox) {
      const featureBbox: BoundingBox = {
        xmin: rowBbox.xmin ?? -180,
        ymin: rowBbox.ymin ?? -90,
        xmax: rowBbox.xmax ?? 180,
        ymax: rowBbox.ymax ?? 90,
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
 * @param overtureType - The Overture feature type to query
 * @param bbox - Geographic bounding box to filter by
 * @param options - Optional configuration
 * @returns Async generator yielding features within the bounding box
 *
 * @example
 * ```typescript
 * const bbox = { xmin: -122.5, ymin: 37.7, xmax: -122.3, ymax: 37.9 };
 *
 * for await (const feature of readByBbox('place', bbox)) {
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
  const { useStacIndex = true } = options;

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

  let filePaths: string[];

  if (useStacIndex) {
    // Use STAC index to find files that intersect with bbox
    filePaths = await getFilesFromStac(overtureType, bbox, release);

    if (filePaths.length === 0) {
      return; // No intersecting files found
    }
  } else {
    // Without STAC index, we would need to list all files in the dataset
    // This is not recommended for large datasets
    throw new Error(
      'Non-STAC index reading is not currently supported. Use useStacIndex: true'
    );
  }

  // Read features from each file
  for (const filePath of filePaths) {
    const features = await readFeaturesFromFile(filePath, bbox);
    for (const feature of features) {
      yield feature;
    }
  }
}

/**
 * Read all Overture features by type within a bounding box.
 *
 * This is a convenience function that collects all features from the
 * async generator into an array.
 *
 * @param overtureType - The Overture feature type to query
 * @param bbox - Geographic bounding box to filter by
 * @param options - Optional configuration
 * @returns Promise resolving to array of features within the bounding box
 *
 * @example
 * ```typescript
 * const bbox = { xmin: -122.5, ymin: 37.7, xmax: -122.3, ymax: 37.9 };
 * const places = await readByBboxAll('place', bbox);
 * console.log(`Found ${places.length} places`);
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
