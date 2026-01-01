# @brad/overturemaps - TODO List

This document outlines the implementation roadmap for the @brad/overturemaps library.

## Phase 1: Project Foundation ✓

- [x] Create project scaffolding
- [x] Set up package.json with MIT license
- [x] Create TypeScript configuration
- [x] Write technical specification (SPEC.md)
- [x] Create README with project overview
- [x] Add .gitignore for Node.js project
- [ ] Set up testing framework (Jest)
- [ ] Configure ESLint and Prettier
- [ ] Set up GitHub Actions for CI/CD

## Phase 2: Core Data Structures

- [ ] Define TypeScript interfaces for data types
  - [ ] `BoundingBox` interface
  - [ ] `DataType` enum/union type
  - [ ] `OutputFormat` enum/union type
  - [ ] `Feature` interface (GeoJSON Feature)
  - [ ] `DownloadOptions` interface
  - [ ] `ClientOptions` interface
  - [ ] `StreamOptions` interface
- [ ] Create utility functions for validation
  - [ ] Validate bounding box coordinates
  - [ ] Validate data type values
  - [ ] Validate output format values
- [ ] Write unit tests for interfaces and validators

## Phase 3: STAC Catalog Integration

- [ ] Research Overture Maps STAC catalog endpoint
- [ ] Implement STAC catalog client
  - [ ] Query catalog for available datasets
  - [ ] Parse STAC metadata
  - [ ] Resolve asset URLs
- [ ] Add caching layer for catalog metadata
- [ ] Write integration tests with mocked responses
- [ ] Document STAC catalog usage

## Phase 4: S3 Data Access

- [ ] Set up AWS SDK S3 client
  - [ ] Configure for anonymous/public access
  - [ ] Handle S3 bucket/key resolution
- [ ] Implement streaming S3 downloads
  - [ ] Support byte-range requests
  - [ ] Handle large files efficiently
- [ ] Add retry logic for network failures
- [ ] Write integration tests with S3
- [ ] Optimize for concurrent downloads

## Phase 5: Parquet Support

- [ ] Research JavaScript Parquet libraries
  - [ ] Evaluate `parquetjs`
  - [ ] Evaluate `@dsnp/parquetjs`
  - [ ] Evaluate Apache Arrow JS
- [ ] Implement Parquet reader
  - [ ] Stream Parquet data
  - [ ] Extract GeoParquet spatial metadata
  - [ ] Handle schema evolution
- [ ] Add spatial filtering at Parquet level
  - [ ] Push down bounding box predicates
  - [ ] Minimize data transfer
- [ ] Write tests with sample Parquet files
- [ ] Benchmark Parquet reading performance

## Phase 6: Format Conversion

- [ ] Implement GeoJSON output
  - [ ] Convert Parquet features to GeoJSON
  - [ ] Handle CRS transformations if needed
  - [ ] Pretty-print vs. compact options
- [ ] Implement GeoJSONSeq output
  - [ ] Newline-delimited streaming output
  - [ ] Memory-efficient processing
- [ ] Implement GeoParquet output (if feasible)
  - [ ] Write Parquet files with spatial metadata
  - [ ] Maintain schema compatibility
- [ ] Add format conversion utilities
- [ ] Write conversion tests
- [ ] Document format options

## Phase 7: OvertureClient Implementation

- [ ] Create main `OvertureClient` class
- [ ] Implement `download()` method
  - [ ] Accept DownloadOptions
  - [ ] Query STAC catalog or S3 directly
  - [ ] Stream data to file or output stream
  - [ ] Show progress (optional)
- [ ] Implement `stream()` method
  - [ ] Return AsyncIterator of features
  - [ ] Support backpressure
  - [ ] Handle errors gracefully
- [ ] Add configuration options
  - [ ] Timeout settings
  - [ ] Skip catalog option
  - [ ] Connection settings
- [ ] Write comprehensive unit tests
- [ ] Create integration tests with real data

## Phase 8: GERS Feature Lookup

- [ ] Research GERS (Global Entity Reference System)
- [ ] Implement `getFeatureByGERS()` method
  - [ ] Query by GERS UUID
  - [ ] Return feature or null
  - [ ] Handle multiple versions
- [ ] Add caching for GERS lookups
- [ ] Write tests for GERS functionality
- [ ] Document GERS ID format and usage

## Phase 9: Error Handling & Resilience

- [ ] Implement comprehensive error classes
  - [ ] `NetworkError`
  - [ ] `ValidationError`
  - [ ] `DataFormatError`
  - [ ] `NotFoundError`
- [ ] Add retry logic with exponential backoff
- [ ] Handle partial download failures
- [ ] Implement graceful degradation
- [ ] Add timeout handling
- [ ] Write error handling tests
- [ ] Document error scenarios

## Phase 10: Documentation

- [ ] Write getting started guide
  - [ ] Installation instructions
  - [ ] Basic usage examples
  - [ ] Configuration options
- [ ] Create API reference documentation
  - [ ] Use TypeDoc or similar
  - [ ] Document all public APIs
  - [ ] Include code examples
- [ ] Add usage examples
  - [ ] Download building footprints for a city
  - [ ] Stream POIs within a bounding box
  - [ ] Export to different formats
  - [ ] Integrate with MapLibre/Leaflet
- [ ] Write troubleshooting guide
- [ ] Create migration guide from overturemaps-py
- [ ] Add contributing guidelines

## Phase 11: CLI Tool (Optional)

- [ ] Design CLI interface
- [ ] Implement command-line argument parsing
  - [ ] Use `commander` or `yargs`
  - [ ] Support all API options
- [ ] Add progress indicators
  - [ ] Download progress bar
  - [ ] ETA calculations
- [ ] Implement output to stdout or file
- [ ] Add verbose/debug logging
- [ ] Write CLI tests
- [ ] Document CLI usage

## Phase 12: Performance Optimization

- [ ] Profile common operations
- [ ] Optimize bounding box filtering
- [ ] Implement parallel chunk downloads
- [ ] Add connection pooling
- [ ] Optimize memory usage
- [ ] Benchmark against overturemaps-py
- [ ] Add performance tests
- [ ] Document performance characteristics

## Phase 13: Browser Support (Future)

- [ ] Evaluate browser compatibility
- [ ] Implement Web Worker support
- [ ] Add IndexedDB caching
- [ ] Handle CORS issues
- [ ] Create browser-specific build
- [ ] Write browser examples
- [ ] Test in major browsers
- [ ] Document browser limitations

## Phase 14: Release Preparation

- [ ] Comprehensive testing
  - [ ] Run full test suite
  - [ ] Test with various dataset sizes
  - [ ] Test all format combinations
- [ ] Security audit
  - [ ] Review dependencies
  - [ ] Check for vulnerabilities
  - [ ] Validate input sanitization
- [ ] Performance validation
- [ ] Documentation review
- [ ] Create changelog
- [ ] Tag version 0.1.0
- [ ] Publish to npm
- [ ] Announce release

## Future Enhancements (Post-1.0)

- [ ] Support additional data sources
- [ ] Implement spatial query operations
- [ ] Add data transformation utilities
- [ ] Integration with visualization libraries
- [ ] WebAssembly optimizations
- [ ] GraphQL API wrapper
- [ ] Real-time data update notifications
- [ ] Data export to various GIS formats
- [ ] Spatial indexing for faster queries
- [ ] Multi-region/CDN support

## Maintenance Tasks (Ongoing)

- [ ] Monitor Overture schema updates
- [ ] Update dependencies regularly
- [ ] Address security vulnerabilities
- [ ] Respond to issues and PRs
- [ ] Keep documentation up-to-date
- [ ] Track overturemaps-py changes
- [ ] Maintain backward compatibility
- [ ] Release bug fixes and patches

## Research & Investigation

- [ ] Investigate alternative Parquet libraries
- [ ] Research optimal chunk sizes for streaming
- [ ] Evaluate compression options
- [ ] Study Overture data update frequency
- [ ] Investigate WebAssembly for Parquet
- [ ] Research spatial indexing strategies
- [ ] Evaluate caching strategies
- [ ] Study browser limitations for large files

---

**Note:** This is a living document. Tasks will be updated as the project evolves and new requirements emerge.
