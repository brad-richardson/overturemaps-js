/**
 * GERS (Global Entity Reference System) lookup functionality
 *
 * Provides efficient lookup of Overture features by their GERS ID using parquet-wasm.
 * Works in both browser and Node.js environments.
 */

import { tableFromIPC } from 'apache-arrow';
import type { Table as ArrowTable } from 'apache-arrow';
import * as parquetWasm from 'parquet-wasm/esm';
import wkx from 'wkx';
import { getStacCatalog, getLatestRelease } from './stac.js';
import type { BoundingBox, Feature, GersRegistryResult, Geometry } from './types.js';

const S3_BASE_URL = 'https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com';

// UUID v4 format validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Track WASM initialization state
 */
let wasmInitialized = false;

/**
 * Initialize parquet-wasm if needed (for browser environments)
 */
async function ensureWasmInitialized(): Promise<void> {
  if (!wasmInitialized) {
    // In browser environments, we need to call the default init function
    // In Node.js with the node export, this is already initialized
    if (typeof parquetWasm.default === 'function') {
      await parquetWasm.default();
    }
    wasmInitialized = true;
  }
}

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
 * Read a parquet file from URL and return all rows as objects.
 */
async function readParquetFromUrl(
  url: string,
  options?: { columns?: string[] }
): Promise<Record<string, unknown>[]> {
  await ensureWasmInitialized();

  // Fetch the file
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();

  // Read parquet data with options
  const table = parquetWasm.readParquet(new Uint8Array(buffer), {
    columns: options?.columns,
  });
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
 * Query the registry file for a specific GERS ID.
 * Returns the first matching row.
 */
async function queryRegistryById(
  registryUrl: string,
  gersId: string
): Promise<Record<string, unknown> | null> {
  const rows = await readParquetFromUrl(registryUrl, {
    columns: ['id', 'path', 'bbox', 'version', 'first_seen', 'last_seen', 'last_changed'],
  });

  // Find the row with matching ID
  for (const row of rows) {
    if ((row.id as string)?.toLowerCase() === gersId) {
      return row;
    }
  }
  return null;
}

/**
 * Query the feature file for a specific GERS ID using streaming.
 * Uses HTTP range requests for efficient access to remote files.
 */
async function queryFeatureById(
  featureUrl: string,
  gersId: string
): Promise<Record<string, unknown> | null> {
  await ensureWasmInitialized();

  // Use ParquetFile for streaming from URL with HTTP range requests
  const parquetFile = await parquetWasm.ParquetFile.fromUrl(featureUrl);

  try {
    // Stream with limit=1 since we only expect one match
    const stream = await parquetFile.stream({
      batchSize: 1024,
      concurrency: 4,
    });

    // Process batches looking for our ID using reader pattern
    // (ReadableStream doesn't have async iterator in all environments)
    const reader = stream.getReader();
    try {
      while (true) {
        const { done, value: wasmRecordBatch } = await reader.read();
        if (done) break;

        const ipcStream = wasmRecordBatch.intoIPCStream();
        const arrowTable: ArrowTable = tableFromIPC(ipcStream);

        for (const row of arrowTable) {
          const rowObj = row.toJSON() as Record<string, unknown>;
          if ((rowObj.id as string)?.toLowerCase() === gersId) {
            // Found it! Include raw geometry bytes for conversion
            return {
              ...rowObj,
              geometry: row.geometry, // Keep as raw Arrow value
            };
          }
        }
      }

      return null;
    } finally {
      reader.releaseLock();
    }
  } finally {
    parquetFile.free();
  }
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
    throw new Error(
      `Failed to fetch STAC catalog: ${error instanceof Error ? error.message : String(error)}`
    );
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
  let row: Record<string, unknown> | null;
  try {
    row = await queryRegistryById(registryUrl, gersIdLower);
  } catch (error) {
    throw new Error(
      `Failed to query GERS registry: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!row) {
    return null;
  }

  const path = row.path as string | null;

  // If path is null, feature is not in current release
  if (path === null || path === undefined) {
    return null;
  }

  // Construct full filepath
  const releasePath = `overturemaps-us-west-2/release/${release}`;
  const fullPath = path.startsWith('/') ? `${releasePath}${path}` : `${releasePath}/${path}`;

  // Extract bbox if all values are available
  let bbox: BoundingBox | null = null;
  const rowBbox = row.bbox as { xmin?: number; ymin?: number; xmax?: number; ymax?: number } | null;
  if (
    rowBbox &&
    rowBbox.xmin != null &&
    rowBbox.ymin != null &&
    rowBbox.xmax != null &&
    rowBbox.ymax != null
  ) {
    bbox = {
      xmin: rowBbox.xmin,
      ymin: rowBbox.ymin,
      xmax: rowBbox.xmax,
      ymax: rowBbox.ymax,
    };
  }

  return {
    filepath: fullPath,
    bbox,
    version: (row.version as number) ?? undefined,
    firstSeen: (row.first_seen as string) ?? undefined,
    lastSeen: (row.last_seen as string) ?? undefined,
    lastChanged: (row.last_changed as string) ?? undefined,
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

  let row: Record<string, unknown> | null;
  try {
    row = await queryFeatureById(featureUrl, gersIdLower);
  } catch (error) {
    throw new Error(
      `Failed to fetch feature: ${error instanceof Error ? error.message : String(error)}`
    );
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

  // Get geometry (WKB bytes from Arrow)
  const geometryBytes = row.geometry as Uint8Array | undefined;
  if (!geometryBytes) {
    throw new Error('Feature has no valid geometry');
  }

  const geometry = wkbToGeoJSON(geometryBytes);
  if (!geometry) {
    throw new Error('Failed to parse geometry');
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
 * Close resources (no-op for parquet-wasm, kept for API compatibility).
 * @deprecated This function is no longer needed with parquet-wasm.
 */
export async function closeDb(): Promise<void> {
  // No persistent connection to close with parquet-wasm
  // Kept for backwards API compatibility
}
