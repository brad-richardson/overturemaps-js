# @brad/overturemaps - Technical Specification

## Overview

This is an **unofficial** JavaScript/TypeScript client library for accessing Overture Maps Foundation data, inspired by the official [overturemaps-py](https://github.com/OvertureMaps/overturemaps-py) Python CLI tool.

**Note:** This library is not affiliated with, endorsed by, or supported by the Overture Maps Foundation. For official tools, please refer to the [overturemaps-py](https://github.com/OvertureMaps/overturemaps-py) repository.

## Goals

1. Provide a JavaScript/TypeScript API for downloading Overture Maps data
2. Support both Node.js and browser environments (where feasible)
3. Enable streaming of large geospatial datasets efficiently
4. Match the core functionality of overturemaps-py where applicable
5. Provide TypeScript type definitions for improved developer experience

## Core Functionality

### 1. Data Download API

#### Supported Data Types
- `address` - Address data
- `base` - Land, infrastructure, and water features
- `building` - Building footprints
- `division` - Administrative boundaries
- `place` - Points of interest (POIs)
- `transportation` - Roads and connectors

#### Supported Output Formats
- **GeoJSON** - Standard GeoJSON format
- **GeoJSONSeq** - Newline-delimited GeoJSON (GeoJSON Sequence)
- **GeoParquet** - Parquet format optimized for geospatial data (if feasible in JS)

#### Bounding Box Support
- Allow users to specify a geographic bounding box (west, south, east, north)
- Only download data within the specified bounds for efficiency
- Support downloading entire datasets when no bounding box is specified

### 2. Streaming Interface

```typescript
interface DownloadOptions {
  type: DataType;
  bbox?: BoundingBox;
  format: OutputFormat;
  output?: string | NodeJS.WritableStream;
}

interface BoundingBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

type DataType = 'address' | 'base' | 'building' | 'division' | 'place' | 'transportation';
type OutputFormat = 'geojson' | 'geojsonseq' | 'geoparquet';
```

### 3. JavaScript/TypeScript API

```typescript
// Main API class
class OvertureClient {
  constructor(options?: ClientOptions);
  
  // Download data to file or stream
  download(options: DownloadOptions): Promise<void>;
  
  // Stream data as async iterator
  stream(options: StreamOptions): AsyncIterator<Feature>;
  
  // Get feature by GERS ID
  getFeatureByGERS(id: string): Promise<Feature | null>;
}

// Configuration options
interface ClientOptions {
  timeout?: number;
  connectionTimeout?: number;
  skipCatalog?: boolean; // Skip STAC catalog and use S3 directly
}

// Stream options
interface StreamOptions {
  type: DataType;
  bbox?: BoundingBox;
  format?: OutputFormat;
}
```

### 4. CLI Tool (Future)

While the initial focus is on the library API, a CLI tool should eventually be provided:

```bash
# Example usage (future)
npx @brad/overturemaps download \
  --bbox=-71.068,42.353,-71.058,42.363 \
  --type=building \
  --format=geojson \
  --output=boston.geojson
```

## Technical Architecture

### Data Access Layer

1. **STAC Catalog Integration**
   - Use STAC (SpatioTemporal Asset Catalog) to discover available datasets
   - Query the Overture STAC catalog for metadata
   - Option to skip catalog and access S3 directly for performance

2. **S3/Cloud Storage Access**
   - Direct access to Overture data stored in cloud object storage
   - Support for streaming large files
   - Efficient partial reads when using bounding boxes

3. **Parquet Reading**
   - Use Apache Arrow JavaScript libraries or similar
   - Consider `parquetjs` or `@dsnp/parquetjs` for Parquet support
   - Stream processing for memory efficiency

### Filtering and Processing

1. **Spatial Filtering**
   - Filter features by bounding box
   - Implement efficient spatial indexing if needed
   - Push-down predicates to minimize data transfer

2. **Format Conversion**
   - Convert between Parquet, GeoJSON, and GeoJSONSeq
   - Maintain spatial reference system information
   - Handle large datasets via streaming

### Dependencies (Proposed)

- **Apache Arrow** (`apache-arrow`) - For Parquet support
- **Parquet libraries** (`parquetjs`, `@dsnp/parquetjs`) - Parquet reading/writing
- **AWS SDK** (`@aws-sdk/client-s3`) - S3 access for data retrieval
- **STAC Client** - For catalog queries (may need custom implementation)
- **Streaming utilities** (`stream`, `readable-stream`) - Node.js streams

## Non-Goals (Initial Release)

1. Data visualization (leave to other libraries like MapLibre, Leaflet, etc.)
2. Spatial analysis operations (leave to Turf.js or similar)
3. Data editing or uploading
4. Complete feature parity with overturemaps-py (focus on core download/streaming)
5. Full browser support for all operations (large data downloads may be Node.js only)

## Performance Considerations

1. **Streaming First**
   - All operations should support streaming to handle arbitrarily large datasets
   - Avoid loading entire datasets into memory

2. **Parallel Downloads**
   - Support concurrent downloads of multiple tiles/chunks
   - Configurable parallelism

3. **Caching**
   - Optional local caching of catalog metadata
   - Optional caching of downloaded tiles

## Error Handling

1. Network errors with retry logic
2. Invalid bounding box detection
3. Unsupported data type/format combinations
4. Quota/rate limiting from data sources
5. Corrupted or incomplete data

## Testing Strategy

1. Unit tests for core functions
2. Integration tests with small sample datasets
3. Mock S3/STAC responses for reliable testing
4. Performance benchmarks for large datasets
5. Browser compatibility tests (where applicable)

## Documentation Requirements

1. API reference documentation (generated from TypeScript)
2. Getting started guide
3. Usage examples for common scenarios
4. Migration guide from overturemaps-py (for Python users)
5. Troubleshooting guide

## Security Considerations

1. No credentials required for public Overture data
2. Validate and sanitize user inputs (bounding boxes, file paths)
3. Secure temporary file handling
4. Regular dependency updates for security patches

## Versioning and Compatibility

1. Follow semantic versioning (semver)
2. Mark as experimental/beta until API stabilizes
3. Document breaking changes clearly
4. Aim for backward compatibility after 1.0.0

## Future Enhancements

1. Browser support with Web Workers
2. IndexedDB caching for browser environments
3. WebAssembly for performance-critical operations
4. Additional data sources beyond Overture
5. Spatial query operations (beyond bounding box)
6. Integration examples with popular mapping libraries
