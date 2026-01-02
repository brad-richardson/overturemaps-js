/**
 * Shared parquet utilities for Overture Maps
 *
 * Provides parquet-wasm initialization and reading functionality
 * for both browser and Node.js environments.
 */

import { tableFromIPC } from 'apache-arrow';
import type { Table as ArrowTable } from 'apache-arrow';

/**
 * Type for parquet-wasm module
 */
export type ParquetWasmModule = typeof import('parquet-wasm/esm');

/**
 * Promise for ongoing WASM initialization (prevents race conditions)
 */
let wasmPromise: Promise<ParquetWasmModule> | null = null;

/**
 * Initialize parquet-wasm.
 * In Node.js, uses initSync with WASM bytes loaded from filesystem.
 * In browser, uses async initialization with fetch.
 */
async function initializeWasm(): Promise<ParquetWasmModule> {
  const parquetWasm = await import('parquet-wasm/esm');

  if (typeof process !== 'undefined' && process.versions?.node) {
    // In Node.js, load WASM from filesystem and use initSync
    const fs = await import('node:fs');
    const { fileURLToPath } = await import('node:url');

    // Resolve path to the WASM file in parquet-wasm package
    const wasmPath = fileURLToPath(import.meta.resolve('parquet-wasm/esm/parquet_wasm_bg.wasm'));
    const wasmBytes = fs.readFileSync(wasmPath);

    parquetWasm.initSync({ module: wasmBytes });
  } else {
    // In browser, use async initialization
    await parquetWasm.default();
  }

  return parquetWasm;
}

/**
 * Get the parquet-wasm module, loading it appropriately for the environment.
 *
 * Uses Promise-based initialization to prevent race conditions when
 * multiple concurrent calls are made before initialization completes.
 *
 * @returns Initialized parquet-wasm module
 */
export async function getParquetWasm(): Promise<ParquetWasmModule> {
  if (!wasmPromise) {
    wasmPromise = initializeWasm();
  }
  return wasmPromise;
}

/**
 * Read a parquet file from URL and return all rows as objects.
 * Uses parquet-wasm for consistent handling across environments.
 *
 * @param url - URL of the parquet file to read
 * @param options - Optional configuration (columns to read)
 * @returns Array of row objects from the parquet file
 */
export async function readParquetFromUrl(
  url: string,
  options?: { columns?: string[] }
): Promise<Record<string, unknown>[]> {
  const parquetWasm = await getParquetWasm();

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
