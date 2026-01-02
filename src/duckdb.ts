/**
 * DuckDB-WASM integration for efficient parquet queries with predicate pushdown
 *
 * This module provides optional DuckDB-WASM support for bbox and ID queries.
 * When @duckdb/duckdb-wasm is installed and properly initialized, queries use
 * SQL with predicate pushdown for efficient row-group filtering.
 *
 * Falls back to parquet-wasm if DuckDB is not available.
 */

import type { BoundingBox } from './types';

/**
 * DuckDB async connection type from @duckdb/duckdb-wasm
 */
type AsyncDuckDBConnection = {
  query(sql: string): Promise<{ toArray(): { toJSON(): unknown }[] }>;
  close(): Promise<void>;
};

type AsyncDuckDB = {
  connect(): Promise<AsyncDuckDBConnection>;
  terminate(): Promise<void>;
};

/**
 * Cached DuckDB state
 */
let duckdb: AsyncDuckDB | null = null;
let duckdbConnection: AsyncDuckDBConnection | null = null;
let duckdbAvailable: boolean | null = null;
let initPromise: Promise<boolean> | null = null;

/**
 * Check if DuckDB-WASM is available (installed as optional dependency)
 * This attempts to initialize DuckDB - if initialization fails, returns false
 */
export async function isDuckDBAvailable(): Promise<boolean> {
  if (duckdbAvailable !== null) {
    return duckdbAvailable;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = initializeDuckDB();
  return initPromise;
}

/**
 * Initialize DuckDB-WASM
 */
async function initializeDuckDB(): Promise<boolean> {
  try {
    // Dynamic import to check if duckdb-wasm is installed
    const duckdbModule = await import('@duckdb/duckdb-wasm');

    // Get the best bundle for this environment
    const bundles = duckdbModule.getJsDelivrBundles();
    const bundle = await duckdbModule.selectBundle(bundles);

    // Create worker - this will fail in Node.js if Worker is not available
    const worker = new Worker(bundle.mainWorker!);
    const logger = new duckdbModule.ConsoleLogger(duckdbModule.LogLevel.WARNING);
    const db = new duckdbModule.AsyncDuckDB(logger, worker);

    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

    // Create connection and configure for HTTP access
    const conn = await db.connect();

    // Load httpfs extension for HTTP parquet access
    await conn.query('INSTALL httpfs;');
    await conn.query('LOAD httpfs;');

    duckdb = db as unknown as AsyncDuckDB;
    duckdbConnection = conn as unknown as AsyncDuckDBConnection;
    duckdbAvailable = true;
    return true;
  } catch {
    // DuckDB initialization failed - this is expected in Node.js
    // or when the package is not installed
    duckdbAvailable = false;
    return false;
  }
}

/**
 * Query a parquet file with bounding box filter using DuckDB SQL
 *
 * @param url - URL of the parquet file
 * @param bbox - Bounding box filter
 * @param options - Query options (limit)
 * @returns Array of row objects
 */
export async function queryParquetWithBbox(
  url: string,
  bbox: BoundingBox,
  options?: { limit?: number }
): Promise<Record<string, unknown>[]> {
  if (!duckdbConnection) {
    throw new Error('DuckDB not initialized');
  }

  // Build SQL query with bbox predicate pushdown
  let sql = `
    SELECT *
    FROM parquet_scan('${url}')
    WHERE bbox.xmin <= ${bbox.xmax}
      AND bbox.xmax >= ${bbox.xmin}
      AND bbox.ymin <= ${bbox.ymax}
      AND bbox.ymax >= ${bbox.ymin}
  `;

  if (options?.limit) {
    sql += ` LIMIT ${options.limit}`;
  }

  const result = await duckdbConnection.query(sql);
  return result.toArray().map((row) => row.toJSON() as Record<string, unknown>);
}

/**
 * Query a parquet file by ID using DuckDB SQL
 *
 * @param url - URL of the parquet file
 * @param id - ID to search for
 * @param idColumn - Name of the ID column (default: 'id')
 * @returns Matching row or null
 */
export async function queryParquetById(
  url: string,
  id: string,
  idColumn: string = 'id'
): Promise<Record<string, unknown> | null> {
  if (!duckdbConnection) {
    throw new Error('DuckDB not initialized');
  }

  const sql = `
    SELECT *
    FROM parquet_scan('${url}')
    WHERE "${idColumn}" = '${id}'
    LIMIT 1
  `;

  const result = await duckdbConnection.query(sql);
  const rows = result.toArray().map((row) => row.toJSON() as Record<string, unknown>);

  return rows.length > 0 ? rows[0] : null;
}

/**
 * Close DuckDB connection and instance
 */
export async function closeDuckDB(): Promise<void> {
  if (duckdbConnection) {
    await duckdbConnection.close();
    duckdbConnection = null;
  }
  if (duckdb) {
    await duckdb.terminate();
    duckdb = null;
  }
}
