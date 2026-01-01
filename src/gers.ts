/**
 * GERS (Global Entity Reference System) lookup functionality
 *
 * Provides efficient lookup of Overture features by their GERS ID using DuckDB.
 */

import * as duckdb from 'duckdb';
import { getStacCatalog, getLatestRelease } from './stac';
import type { BoundingBox, Feature, GersRegistryResult, Geometry } from './types';

const S3_BASE_URL = 'https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com';

// Cached DuckDB instance
let db: duckdb.Database | null = null;
let conn: duckdb.Connection | null = null;

/**
 * Initialize DuckDB instance (cached singleton).
 */
async function getDb(): Promise<duckdb.Connection> {
  if (conn) {
    return conn;
  }

  return new Promise((resolve, reject) => {
    db = new duckdb.Database(':memory:', (err) => {
      if (err) {
        reject(err);
        return;
      }

      conn = db!.connect();

      // Install and load spatial extension for geometry parsing
      conn.run('INSTALL spatial; LOAD spatial;', (err) => {
        if (err) {
          reject(err);
          return;
        }
        // Also install httpfs for reading from HTTP URLs
        conn!.run('INSTALL httpfs; LOAD httpfs;', (err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(conn!);
        });
      });
    });
  });
}

/**
 * Run a DuckDB query and return results as an array of objects.
 */
function runQuery<T = Record<string, unknown>>(
  conn: duckdb.Connection,
  sql: string
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    conn.all(sql, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows as T[]);
      }
    });
  });
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
  const gersIdLower = gersId.toLowerCase();
  const catalog = await getStacCatalog();
  const release = await getLatestRelease();

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

  const conn = await getDb();
  const registryUrl = `${S3_BASE_URL}/registry/${registryFile}`;

  // Query the registry file for this GERS ID
  const rows = await runQuery<{
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
  }>(
    conn,
    `
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
  `
  );

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

  // Extract bbox if available
  let bbox: BoundingBox | null = null;
  if (row.bbox_xmin !== null && row.bbox_xmin !== undefined) {
    bbox = {
      xmin: row.bbox_xmin,
      ymin: row.bbox_ymin!,
      xmax: row.bbox_xmax!,
      ymax: row.bbox_ymax!,
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
  const gersIdLower = gersId.toLowerCase();

  // Get registry result (use provided or fetch)
  const registryResult = options?.registryResult ?? (await queryGersRegistry(gersIdLower));

  if (!registryResult) {
    return null;
  }

  const conn = await getDb();
  const featureUrl = `${S3_BASE_URL}/${registryResult.filepath}`;

  // First, get the column names (excluding geometry and bbox)
  const schemaRows = await runQuery<{ column_name: string }>(
    conn,
    `
    SELECT column_name
    FROM (DESCRIBE SELECT * FROM read_parquet('${featureUrl}') LIMIT 0)
  `
  );

  const columns = schemaRows
    .map((r) => r.column_name)
    .filter((name) => name !== 'geometry' && name !== 'bbox');

  // Query the feature file, converting geometry to GeoJSON
  const rows = await runQuery<Record<string, unknown>>(
    conn,
    `
    SELECT
      ${columns.map((c) => `"${c}"`).join(', ')},
      ST_AsGeoJSON(ST_GeomFromWKB(geometry)) as geometry_geojson
    FROM read_parquet('${featureUrl}')
    WHERE id = '${gersIdLower}'
    LIMIT 1
  `
  );

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

  // Parse geometry from GeoJSON string
  const geometry: Geometry = JSON.parse(row.geometry_geojson as string);

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
 */
export async function closeDb(): Promise<void> {
  return new Promise((resolve) => {
    if (conn) {
      conn = null;
    }
    if (db) {
      db.close(() => {
        db = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}
