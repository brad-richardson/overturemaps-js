/**
 * GERS (Global Entity Reference System) lookup functionality
 *
 * Provides efficient lookup of Overture features by their GERS ID using hyparquet.
 * Works in both browser and Node.js environments.
 */

import { asyncBufferFromUrl, parquetQuery } from 'hyparquet';
import { getStacCatalog, getLatestRelease } from './stac.js';
import type { BoundingBox, Feature, GersRegistryResult, Geometry } from './types.js';

const S3_BASE_URL = 'https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com';

// UUID v4 format validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate that a string is a valid GERS ID (UUID format).
 * This prevents injection by ensuring only valid UUIDs are used in queries.
 */
function isValidGersId(id: string): boolean {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

/**
 * Binary search through manifest tuples to find the file containing the given GERS ID.
 *
 * @param manifest - List of [filename, max_id] tuples, sorted by max_id
 * @param gersId - The GERS ID to search for (lowercase)
 * @returns Filename containing the ID, or null if not found
 */
function binarySearchManifest(manifest: [string, string][], gersId: string): string | null {
  let left = 0;
  let right = manifest.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const [filename, maxId] = manifest[mid];

    if (gersId <= maxId) {
      // Check if this is the first file where maxId >= gersId
      if (mid === 0 || manifest[mid - 1][1] < gersId) {
        return filename;
      } else {
        right = mid - 1;
      }
    } else {
      left = mid + 1;
    }
  }

  return null;
}

/**
 * Read a single row from a Parquet file by ID.
 */
async function readParquetById<T extends Record<string, unknown>>(
  url: string,
  id: string,
  columns?: string[]
): Promise<T | null> {
  const file = await asyncBufferFromUrl({ url });
  const rows = await parquetQuery({
    file,
    columns,
    filter: { id: { $eq: id } },
    rowEnd: 1,
  }) as T[];

  return rows.length > 0 ? rows[0] : null;
}

/**
 * Read all column names from a Parquet file schema.
 */
async function getParquetColumns(url: string): Promise<string[]> {
  const { parquetMetadataAsync, parquetSchema } = await import('hyparquet');
  const file = await asyncBufferFromUrl({ url });
  const metadata = await parquetMetadataAsync(file);
  const schema = parquetSchema(metadata);

  return schema.children.map((child) => child.element.name);
}

/**
 * Query the GERS registry to get metadata for a given GERS ID.
 *
 * @param gersId - The GERS ID to look up (UUID format)
 * @returns Registry result with filepath and bbox, or null if not found
 */
export async function queryGersRegistry(gersId: string): Promise<GersRegistryResult | null> {
  if (!isValidGersId(gersId)) {
    throw new Error(`Invalid GERS ID format: ${gersId}. Expected UUID format.`);
  }

  const gersIdLower = gersId.toLowerCase();

  let catalog;
  let release;
  try {
    catalog = await getStacCatalog();
    release = await getLatestRelease();
  } catch (error) {
    throw new Error(`Failed to fetch STAC catalog: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!catalog.registry) {
    throw new Error('Registry configuration not found in STAC catalog');
  }

  const { manifest } = catalog.registry;

  if (!manifest || manifest.length === 0) {
    throw new Error('Registry manifest is empty in STAC catalog');
  }

  // Use binary search to find the file containing this GERS ID
  const registryFile = binarySearchManifest(manifest, gersIdLower);

  if (!registryFile) {
    return null;
  }

  const registryUrl = `${S3_BASE_URL}/registry/${registryFile}`;

  // Query the registry file for this GERS ID
  let row;
  try {
    row = await readParquetById<{
      id: string;
      path: string | null;
      bbox: {
        xmin: number | null;
        ymin: number | null;
        xmax: number | null;
        ymax: number | null;
      } | null;
      version: number | null;
      first_seen: string | null;
      last_seen: string | null;
      last_changed: string | null;
    }>(registryUrl, gersIdLower, ['id', 'path', 'bbox', 'version', 'first_seen', 'last_seen', 'last_changed']);
  } catch (error) {
    throw new Error(`Failed to query GERS registry: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!row) {
    return null;
  }

  const path = row.path;

  // If path is null, feature is not in current release
  if (path === null || path === undefined) {
    return null;
  }

  // Construct full filepath
  const releasePath = `overturemaps-us-west-2/release/${release}`;
  const fullPath = path.startsWith('/') ? `${releasePath}${path}` : `${releasePath}/${path}`;

  // Extract bbox if all values are available
  let bbox: BoundingBox | null = null;
  if (
    row.bbox &&
    row.bbox.xmin != null &&
    row.bbox.ymin != null &&
    row.bbox.xmax != null &&
    row.bbox.ymax != null
  ) {
    bbox = {
      xmin: row.bbox.xmin,
      ymin: row.bbox.ymin,
      xmax: row.bbox.xmax,
      ymax: row.bbox.ymax,
    };
  }

  return {
    filepath: fullPath,
    bbox,
    version: row.version ?? undefined,
    firstSeen: row.first_seen ?? undefined,
    lastSeen: row.last_seen ?? undefined,
    lastChanged: row.last_changed ?? undefined,
  };
}

/**
 * Fetch a feature by its GERS ID.
 *
 * @param gersId - The GERS ID to look up (UUID format)
 * @param options - Optional configuration (registryResult to skip registry lookup)
 * @returns The GeoJSON Feature, or null if not found
 */
export async function getFeatureByGersId(
  gersId: string,
  options?: { registryResult?: GersRegistryResult }
): Promise<Feature | null> {
  if (!isValidGersId(gersId)) {
    throw new Error(`Invalid GERS ID format: ${gersId}. Expected UUID format.`);
  }

  const gersIdLower = gersId.toLowerCase();

  // Get registry result (use provided or fetch)
  const registryResult = options?.registryResult ?? (await queryGersRegistry(gersIdLower));

  if (!registryResult) {
    return null;
  }

  const featureUrl = `${S3_BASE_URL}/${registryResult.filepath}`;

  let columns: string[];
  let row: Record<string, unknown> | null;
  try {
    // First, get the column names (excluding bbox since we get it from registry)
    columns = await getParquetColumns(featureUrl);
    const columnsToRead = columns.filter((name) => name !== 'bbox');

    // Query the feature file
    row = await readParquetById<Record<string, unknown>>(featureUrl, gersIdLower, columnsToRead);
  } catch (error) {
    throw new Error(`Failed to fetch feature: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!row) {
    return null;
  }

  // Build properties from all columns except geometry
  const properties: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    if (key !== 'geometry') {
      properties[key] = row[key];
    }
  }

  // Get geometry (hyparquet automatically converts WKB to GeoJSON for GeoParquet files)
  const geometry = row.geometry as Geometry | undefined;
  if (!geometry) {
    throw new Error('Feature has no valid geometry');
  }

  return {
    type: 'Feature',
    id: gersIdLower,
    geometry,
    properties,
    bbox: registryResult.bbox
      ? [
          registryResult.bbox.xmin,
          registryResult.bbox.ymin,
          registryResult.bbox.xmax,
          registryResult.bbox.ymax,
        ]
      : undefined,
  };
}

/**
 * Close resources (no-op for hyparquet, kept for API compatibility).
 * @deprecated This function is no longer needed with hyparquet.
 */
export async function closeDb(): Promise<void> {
  // No persistent connection to close with hyparquet
  // Kept for backwards API compatibility
}
