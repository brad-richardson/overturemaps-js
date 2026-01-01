# @brad/overturemaps

An **unofficial** JavaScript/TypeScript client library for accessing [Overture Maps Foundation](https://overturemaps.org/) data.

> ⚠️ **Disclaimer**: This is an unofficial client library and is not affiliated with, endorsed by, or supported by the Overture Maps Foundation. For official tools, please visit [overturemaps-py](https://github.com/OvertureMaps/overturemaps-py).

## 🚧 Status: In Development

This project is currently in the early stages of development. The API is not yet stable and functionality is being actively implemented.

## About

This library is inspired by the official [overturemaps-py](https://github.com/OvertureMaps/overturemaps-py) Python CLI tool and aims to bring similar functionality to the JavaScript/TypeScript ecosystem.

### What is Overture Maps?

[Overture Maps Foundation](https://overturemaps.org/) is a collaborative effort to develop interoperable and open map data. The foundation provides free, high-quality geospatial data including:

- 🏢 **Buildings** - Building footprints
- 📍 **Places** - Points of interest (POIs)
- 🛣️ **Transportation** - Roads and transportation networks
- 🏛️ **Divisions** - Administrative boundaries
- 📮 **Addresses** - Address data
- 🌍 **Base** - Land, water, and infrastructure features

## Goals

This library aims to:

1. ✅ Provide a JavaScript/TypeScript API for downloading Overture Maps data
2. ✅ Enable efficient streaming of large geospatial datasets
3. ✅ Support multiple output formats (GeoJSON, GeoJSONSeq, GeoParquet)
4. ✅ Allow spatial filtering via bounding boxes
5. ✅ Offer both Node.js API and CLI tool (future)
6. ✅ Provide TypeScript type definitions for improved developer experience

## Planned Features

- **Data Download API**: Download Overture data by type and region
- **Bounding Box Support**: Filter data to specific geographic areas
- **Multiple Formats**: Export to GeoJSON, GeoJSONSeq, and GeoParquet
- **Streaming Interface**: Handle large datasets efficiently
- **GERS Lookup**: Find features by Global Entity Reference System ID
- **TypeScript First**: Full type definitions and excellent IDE support

## Installation (Future)

```bash
npm install @brad/overturemaps
```

or

```bash
yarn add @brad/overturemaps
```

## Usage Examples (Planned API)

### JavaScript/TypeScript API

```typescript
import { OvertureClient } from '@brad/overturemaps';

// Create a client
const client = new OvertureClient();

// Download building footprints for Boston
await client.download({
  type: 'building',
  bbox: {
    west: -71.068,
    south: 42.353,
    east: -71.058,
    north: 42.363
  },
  format: 'geojson',
  output: 'boston-buildings.geojson'
});

// Stream features as an async iterator
for await (const feature of client.stream({
  type: 'place',
  bbox: { west: -122.5, south: 37.7, east: -122.3, north: 37.9 }
})) {
  console.log(feature.properties.name);
}

// Get a specific feature by GERS ID
const feature = await client.getFeatureByGERS('08f1a4a7-5a6b-4c3d-9e2f-1a2b3c4d5e6f');
```

### CLI Tool (Future)

```bash
# Download building footprints
npx @brad/overturemaps download \
  --type=building \
  --bbox=-71.068,42.353,-71.058,42.363 \
  --format=geojson \
  --output=boston-buildings.geojson

# Stream to stdout
npx @brad/overturemaps download \
  --type=place \
  --bbox=-122.5,37.7,-122.3,37.9 \
  --format=geojsonseq
```

## Data Types

- `address` - Address data
- `base` - Land, infrastructure, and water features
- `building` - Building footprints
- `division` - Administrative boundaries
- `place` - Points of interest
- `transportation` - Roads and transportation networks

## Output Formats

- `geojson` - Standard GeoJSON format
- `geojsonseq` - Newline-delimited GeoJSON (streaming friendly)
- `geoparquet` - Parquet format with geospatial extensions

## Documentation

- [SPEC.md](./SPEC.md) - Detailed technical specification
- [TODO.md](./TODO.md) - Implementation roadmap and tasks
- API Reference (coming soon)
- Usage Examples (coming soon)

## Development Status

See [TODO.md](./TODO.md) for the current implementation roadmap. Key phases:

- ✅ Phase 1: Project Foundation (current)
- ⬜ Phase 2: Core Data Structures
- ⬜ Phase 3: STAC Catalog Integration
- ⬜ Phase 4: S3 Data Access
- ⬜ Phase 5: Parquet Support
- ⬜ Phase 6: Format Conversion
- ⬜ Phase 7: Client Implementation

## Contributing

Contributions are welcome! This is an open-source project and we appreciate help from the community.

### Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Build the project: `npm run build`
4. Run tests: `npm test`

See [TODO.md](./TODO.md) for tasks that need implementation.

## Comparison with overturemaps-py

This library aims to provide similar core functionality to the official Python tool:

| Feature | overturemaps-py | @brad/overturemaps |
|---------|-----------------|-------------------|
| Download by data type | ✅ | 🚧 Planned |
| Bounding box filtering | ✅ | 🚧 Planned |
| GeoJSON output | ✅ | 🚧 Planned |
| GeoJSONSeq output | ✅ | 🚧 Planned |
| GeoParquet output | ✅ | 🚧 Planned |
| Streaming interface | ✅ | 🚧 Planned |
| GERS lookup | ✅ | 🚧 Planned |
| CLI tool | ✅ | 🚧 Planned |
| Python API | ✅ | N/A |
| JavaScript API | N/A | 🚧 In Progress |
| TypeScript support | N/A | ✅ Yes |

## License

MIT License - See [LICENSE](./LICENSE) file for details.

## Acknowledgments

- Inspired by [overturemaps-py](https://github.com/OvertureMaps/overturemaps-py)
- Data provided by [Overture Maps Foundation](https://overturemaps.org/)
- Built with support from the open-source community

## Related Projects

- [overturemaps-py](https://github.com/OvertureMaps/overturemaps-py) - Official Python CLI
- [Overture Maps Documentation](https://docs.overturemaps.org/)
- [Overture Maps Website](https://overturemaps.org/)

## Support

This is an unofficial project. For issues related to:
- **This library**: Open an issue on this repository
- **Overture data or official tools**: Visit [overturemaps-py](https://github.com/OvertureMaps/overturemaps-py)
- **Overture Maps Foundation**: Visit [overturemaps.org](https://overturemaps.org/)

---

**Note**: This project is in active development. APIs and functionality are subject to change.