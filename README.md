# @bradrichardson/overturemaps

An **unofficial** JavaScript/TypeScript client library for accessing [Overture Maps Foundation](https://overturemaps.org/) data.

> ⚠️ **Disclaimer**: This is an unofficial client library and is not affiliated with, endorsed by, or supported by the Overture Maps Foundation. For official tools, please visit [overturemaps-py](https://github.com/OvertureMaps/overturemaps-py).

## Installation

```bash
npm install @bradrichardson/overturemaps
```

## Features

- **STAC Integration**: Dynamically discover available releases (no hardcoded versions)
- **GERS Lookup**: Fetch features by Global Entity Reference System ID using DuckDB
- **TypeScript First**: Full type definitions and excellent IDE support

## Usage

### Get Latest Release

```typescript
import { getLatestRelease, getAvailableReleases } from '@bradrichardson/overturemaps';

// Get the latest release version
const latest = await getLatestRelease();
console.log(latest); // e.g., "2025-12-18.0"

// Get all available releases
const [releases, latestVersion] = await getAvailableReleases();
console.log(releases); // ["2025-12-18.0", "2025-11-13.0", ...]
```

### Fetch Feature by GERS ID

```typescript
import { getFeatureByGersId } from '@bradrichardson/overturemaps';

// Look up a feature by its GERS ID
const feature = await getFeatureByGersId('08f1a4a7-5a6b-4c3d-9e2f-1a2b3c4d5e6f');

if (feature) {
  console.log(feature.geometry);
  console.log(feature.properties);
}
```

### Query GERS Registry

```typescript
import { queryGersRegistry } from '@bradrichardson/overturemaps';

// Get metadata about a GERS ID without fetching the full feature
const result = await queryGersRegistry('08f1a4a7-5a6b-4c3d-9e2f-1a2b3c4d5e6f');

if (result) {
  console.log(result.filepath);  // S3 path to the feature
  console.log(result.bbox);      // Bounding box
  console.log(result.version);   // GERS version
}
```

## About Overture Maps

[Overture Maps Foundation](https://overturemaps.org/) is a collaborative effort to develop interoperable and open map data. The foundation provides free, high-quality geospatial data including:

- 🏢 **Buildings** - Building footprints
- 📍 **Places** - Points of interest (POIs)
- 🛣️ **Transportation** - Roads and transportation networks
- 🏛️ **Divisions** - Administrative boundaries
- 📮 **Addresses** - Address data
- 🌍 **Base** - Land, water, and infrastructure features

## License

MIT License - See [LICENSE](./LICENSE) file for details.

## Related Projects

- [overturemaps-py](https://github.com/OvertureMaps/overturemaps-py) - Official Python CLI
- [Overture Maps Documentation](https://docs.overturemaps.org/)
