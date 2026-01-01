# Examples

This directory will contain usage examples for @brad/overturemaps once the library is implemented.

## Planned Examples

### Basic Usage

#### Download Building Footprints
```typescript
import { OvertureClient } from '@brad/overturemaps';

const client = new OvertureClient();

// Download buildings in Boston
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
```

#### Stream Points of Interest
```typescript
import { OvertureClient } from '@brad/overturemaps';

const client = new OvertureClient();

// Stream POIs in San Francisco
for await (const feature of client.stream({
  type: 'place',
  bbox: {
    west: -122.5,
    south: 37.7,
    east: -122.3,
    north: 37.9
  }
})) {
  console.log(`${feature.properties.name} - ${feature.properties.category}`);
}
```

### Advanced Usage

#### Custom Output Stream
```typescript
import { OvertureClient } from '@brad/overturemaps';
import { createWriteStream } from 'fs';
import { createGzip } from 'zlib';

const client = new OvertureClient();
const output = createGzip().pipe(createWriteStream('transportation.geojson.gz'));

await client.download({
  type: 'transportation', // Transportation includes roads, paths, and other infrastructure
  bbox: { west: -122.5, south: 37.7, east: -122.3, north: 37.9 },
  format: 'geojsonseq',
  output
});
```

#### GERS Lookup
```typescript
import { OvertureClient } from '@brad/overturemaps';

const client = new OvertureClient();

// Get a specific feature by GERS ID
const feature = await client.getFeatureByGERS('08f1a4a7-5a6b-4c3d-9e2f-1a2b3c4d5e6f');
if (feature) {
  console.log(feature.properties);
}
```

### Integration Examples

#### With MapLibre GL JS
```typescript
import { OvertureClient } from '@brad/overturemaps';
import maplibregl from 'maplibre-gl';

const client = new OvertureClient();

// Download and add to map
const features = [];
for await (const feature of client.stream({
  type: 'building',
  bbox: { west: -122.5, south: 37.7, east: -122.3, north: 37.9 }
})) {
  features.push(feature);
}

map.addSource('buildings', {
  type: 'geojson',
  data: {
    type: 'FeatureCollection',
    features
  }
});
```

#### With Turf.js for Analysis
```typescript
import { OvertureClient } from '@brad/overturemaps';
import * as turf from '@turf/turf';

const client = new OvertureClient();

// Calculate total building area
let totalArea = 0;
for await (const feature of client.stream({
  type: 'building',
  bbox: { west: -71.068, south: 42.353, east: -71.058, north: 42.363 }
})) {
  totalArea += turf.area(feature);
}
console.log(`Total building area: ${totalArea} m²`);
```

#### With GeoJSON Processing
```typescript
import { OvertureClient } from '@brad/overturemaps';

const client = new OvertureClient();

// Filter and transform features
const restaurants = [];
for await (const feature of client.stream({
  type: 'place',
  bbox: { west: -122.5, south: 37.7, east: -122.3, north: 37.9 }
})) {
  if (feature.properties.category === 'restaurant') {
    restaurants.push({
      name: feature.properties.name,
      coordinates: feature.geometry.coordinates
    });
  }
}
```

### Configuration Examples

#### With Custom Timeout
```typescript
import { OvertureClient } from '@brad/overturemaps';

const client = new OvertureClient({
  timeout: 60000,           // 60 second timeout
  connectionTimeout: 10000  // 10 second connection timeout
});
```

#### Skip STAC Catalog for Direct S3 Access
```typescript
import { OvertureClient } from '@brad/overturemaps';

const client = new OvertureClient({
  skipCatalog: true  // Direct S3 access for better performance
});
```

### CLI Examples (Future)

```bash
# Download building footprints
npx @brad/overturemaps download \
  --type=building \
  --bbox=-71.068,42.353,-71.058,42.363 \
  --format=geojson \
  --output=boston-buildings.geojson

# Stream to stdout and pipe to jq
npx @brad/overturemaps download \
  --type=place \
  --bbox=-122.5,37.7,-122.3,37.9 \
  --format=geojsonseq | jq -c 'select(.properties.category == "restaurant")'

# Download entire dataset (no bbox)
npx @brad/overturemaps download \
  --type=division \
  --format=geoparquet \
  --output=divisions.parquet

# With verbose logging
npx @brad/overturemaps download \
  --type=address \
  --bbox=-74.1,40.6,-73.9,40.8 \
  --format=geojson \
  --output=nyc-addresses.geojson \
  --verbose
```

## Running Examples

Once the library is implemented, examples can be run with:

```bash
# Install dependencies
npm install

# Run TypeScript examples with ts-node
npx ts-node examples/download-buildings.ts

# Or compile and run
npm run build
node dist/examples/download-buildings.js
```

## Contributing Examples

Have a useful example? Please contribute!

1. Create a new TypeScript file in this directory
2. Add clear comments and documentation
3. Test the example with real data
4. Submit a pull request

---

**Note**: These examples represent the planned API and are not yet functional. Implementation is in progress.
