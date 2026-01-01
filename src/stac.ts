/**
 * STAC (SpatioTemporal Asset Catalog) client for Overture Maps
 *
 * Handles discovery of available releases and catalog metadata.
 * No hardcoded releases - always fetches from the live STAC catalog.
 */

const STAC_CATALOG_URL = 'https://stac.overturemaps.org/catalog.json';
const FETCH_TIMEOUT_MS = 30000; // 30 second timeout

export interface StacCatalog {
  type: string;
  id: string;
  description: string;
  title?: string;
  latest: string;
  links: StacLink[];
  registry?: StacRegistry;
}

export interface StacRegistry {
  path: string;
  manifest: [string, string][]; // [filename, max_id] tuples sorted by max_id
}

export interface StacLink {
  rel: string;
  href: string;
  type?: string;
  title?: string;
}

// In-memory cache for the STAC catalog
let cachedCatalog: StacCatalog | null = null;

/**
 * Fetches the STAC catalog from the Overture Maps server.
 * Uses in-memory caching to avoid repeated network requests.
 *
 * @param forceRefresh - If true, bypasses the cache and fetches fresh data
 * @returns The STAC catalog
 */
export async function getStacCatalog(forceRefresh = false): Promise<StacCatalog> {
  if (cachedCatalog && !forceRefresh) {
    return cachedCatalog;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(STAC_CATALOG_URL, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Failed to fetch STAC catalog: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Basic structure validation
    if (!data || typeof data !== 'object' || !data.latest || !Array.isArray(data.links)) {
      throw new Error('Invalid STAC catalog structure');
    }

    cachedCatalog = data as StacCatalog;
    return cachedCatalog;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`STAC catalog fetch timed out after ${FETCH_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Gets the latest release version from the STAC catalog.
 *
 * @returns The latest release version string (e.g., "2024-12-18.0")
 */
export async function getLatestRelease(): Promise<string> {
  const catalog = await getStacCatalog();
  return catalog.latest;
}

/**
 * Gets all available releases from the STAC catalog.
 *
 * @returns Tuple of [all releases, latest release]
 */
export async function getAvailableReleases(): Promise<[string[], string]> {
  const catalog = await getStacCatalog();

  // Extract release versions from child links
  // Links look like: {"rel": "child", "href": "./2024-12-18.0/catalog.json"}
  const releases = catalog.links
    .filter((link) => link.rel === 'child')
    .map((link) => {
      // Extract version from href like "./2024-12-18.0/catalog.json"
      const match = link.href.match(/\.\/([^/]+)\/catalog\.json/);
      return match ? match[1] : null;
    })
    .filter((version): version is string => version !== null)
    .sort()
    .reverse(); // Most recent first

  return [releases, catalog.latest];
}

/**
 * Gets the base URL for a specific release's data.
 *
 * @param release - Release version (defaults to latest)
 * @returns The S3 base URL for the release
 */
export async function getReleaseBaseUrl(release?: string): Promise<string> {
  const version = release ?? (await getLatestRelease());
  return `s3://overturemaps-us-west-2/release/${version}`;
}

/**
 * Gets the HTTPS URL for a release's STAC collections index.
 *
 * @param release - Release version (defaults to latest)
 * @returns URL to the collections.parquet file
 */
export async function getCollectionsUrl(release?: string): Promise<string> {
  const version = release ?? (await getLatestRelease());
  return `https://stac.overturemaps.org/${version}/collections.parquet`;
}

/**
 * Clears the cached STAC catalog.
 * Useful for testing or forcing a refresh.
 */
export function clearCache(): void {
  cachedCatalog = null;
}
