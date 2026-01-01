/**
 * GERS (Global Entity Reference System) lookup functionality
 *
 * Provides efficient lookup of Overture features by their GERS ID using DuckDB-WASM.
 * Works in both browser and Node.js environments.
 */

import * as duckdb from '@duckdb/duckdb-wasm';
import { getStacCatalog, getLatestRelease } from './stac.js';
import type { BoundingBox, Feature, GersRegistryResult, Geometry } from './types.js';

const S3_BASE_URL = 'https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com';

// UUID v4 format validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate that a string is a valid GERS ID (UUID format).
 * This prevents SQL injection by ensuring only valid UUIDs are used in queries.
 */
function isValidGersId(id: string): boolean {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

// Cached DuckDB instance
let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;
let initPromise: Promise<duckdb.AsyncDuckDBConnection> | null = null;

/**
 * Initialize DuckDB-WASM instance (cached singleton).
 * Lazy loaded on first query.
 */
async function getDb(): Promise<duckdb.AsyncDuckDBConnection> {
  if (conn) {
    return conn;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = doInitDuckDB();
  return initPromise;
}

async function doInitDuckDB(): Promise<duckdb.AsyncDuckDBConnection> {
  let worker: Worker | null = null;

  try {
    // Select the best bundle for this environment
    const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());

    // Create worker and database
    worker = new Worker(bundle.mainWorker!);
    const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
    db = new duckdb.AsyncDuckDB(logger, worker);

    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

    // Create connection
    conn = await db.connect();

    // Install and load httpfs for S3 access
    await conn.query('INSTALL httpfs;');
    await conn.query('LOAD httpfs;');
    await conn.query("SET s3_region = 'us-west-2';");

    // Install spatial extension for ST_AsGeoJSON
    await conn.query('INSTALL spatial;');
    await conn.query('LOAD spatial;');

    return conn;
  } catch (error) {
    // Clean up resources on failure
    if (conn) {
      try {
        await conn.close();
      } catch {
        // Ignore cleanup errors
      }
      conn = null;
    }
    if (db) {
      try {
        await db.terminate();
      } catch {
        // Ignore cleanup errors
      }
      db = null;
    } else if (worker) {
      // Worker was created but db.terminate() wasn't called
      worker.terminate();
    }
    initPromise = null;
    throw error;
  }
}

/**
 * Run a DuckDB query and return results as an array of objects.
 */
async function runQuery<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const connection = await getDb();
  const result = await connection.query(sql);
  return result.toArray() as T[];
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
  let rows;
  try {
    rows = await runQuery<{
      id: string;
      path: string | null;
      bbox_xmin: number | null;
      bbox_ymin: number | null;
      bbox_xmax: number | null;
      bbox_ymax: number | null;
      version: number | null;
      first_seen: string | null;
      last_seen: string | null;
      last_changed: string | null;
    }>(`
      SELECT
        id,
        path,
        bbox.xmin as bbox_xmin,
        bbox.ymin as bbox_ymin,
        bbox.xmax as bbox_xmax,
        bbox.ymax as bbox_ymax,
        version,
        first_seen,
        last_seen,
        last_changed
      FROM read_parquet('${registryUrl}')
      WHERE id = '${gersIdLower}'
      LIMIT 1
    `);
  } catch (error) {
    throw new Error(`Failed to query GERS registry: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
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
    row.bbox_xmin != null &&
    row.bbox_ymin != null &&
    row.bbox_xmax != null &&
    row.bbox_ymax != null
  ) {
    bbox = {
      xmin: row.bbox_xmin,
      ymin: row.bbox_ymin,
      xmax: row.bbox_xmax,
      ymax: row.bbox_ymax,
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

  let schemaRows;
  let rows;
  try {
    // First, get the column names (excluding geometry and bbox)
    schemaRows = await runQuery<{ column_name: string }>(`
      SELECT column_name
      FROM (DESCRIBE SELECT * FROM read_parquet('${featureUrl}') LIMIT 0)
    `);

    const columns = schemaRows
      .map((r) => r.column_name)
      .filter((name) => name !== 'geometry' && name !== 'bbox');

    // Query the feature file, converting geometry to GeoJSON
    rows = await runQuery<Record<string, unknown>>(`
      SELECT
        ${columns.map((c) => `"${c}"`).join(', ')},
        ST_AsGeoJSON(ST_GeomFromWKB(geometry)) as geometry_geojson
      FROM read_parquet('${featureUrl}')
      WHERE id = '${gersIdLower}'
      LIMIT 1
    `);
  } catch (error) {
    throw new Error(`Failed to fetch feature: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];

  // Build properties from all columns except geometry_geojson
  const properties: Record<string, unknown> = {};
  for (const key of Object.keys(row)) {
    if (key !== 'geometry_geojson') {
      properties[key] = row[key];
    }
  }

  // Parse geometry from GeoJSON string with safety checks
  if (!row.geometry_geojson || typeof row.geometry_geojson !== 'string') {
    throw new Error('Feature has no valid geometry');
  }

  let geometry: Geometry;
  try {
    geometry = JSON.parse(row.geometry_geojson);
  } catch {
    throw new Error('Failed to parse feature geometry as GeoJSON');
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
 * Close the DuckDB connection and release resources.
 * Ensures all resources are cleaned up even if some cleanup operations fail.
 */
export async function closeDb(): Promise<void> {
  const errors: Error[] = [];

  if (conn) {
    try {
      await conn.close();
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
    conn = null;
  }

  if (db) {
    try {
      await db.terminate();
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
    db = null;
  }

  initPromise = null;

  if (errors.length > 0) {
    const message = errors.map((e) => e.message).join('; ');
    throw new Error(`Failed to close database cleanly: ${message}`);
  }
}
