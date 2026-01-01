/**
 * Type definitions for @bradrichardson/overturemaps
 */

/**
 * Geographic bounding box coordinates
 */
export interface BoundingBox {
  /** Western longitude (min longitude) */
  xmin: number;
  /** Southern latitude (min latitude) */
  ymin: number;
  /** Eastern longitude (max longitude) */
  xmax: number;
  /** Northern latitude (max latitude) */
  ymax: number;
}

/**
 * Supported Overture feature types
 */
export type OvertureType =
  | 'address'
  | 'bathymetry'
  | 'building'
  | 'building_part'
  | 'connector'
  | 'division'
  | 'division_area'
  | 'division_boundary'
  | 'infrastructure'
  | 'land'
  | 'land_cover'
  | 'land_use'
  | 'place'
  | 'segment'
  | 'water';

/**
 * Theme to type mapping (derived from type)
 */
export const typeThemeMap: Record<OvertureType, string> = {
  address: 'addresses',
  bathymetry: 'base',
  building: 'buildings',
  building_part: 'buildings',
  connector: 'transportation',
  division: 'divisions',
  division_area: 'divisions',
  division_boundary: 'divisions',
  infrastructure: 'base',
  land: 'base',
  land_cover: 'base',
  land_use: 'base',
  place: 'places',
  segment: 'transportation',
  water: 'base',
};

/**
 * GeoJSON Feature
 */
export interface Feature<G extends Geometry = Geometry, P = Record<string, unknown>> {
  type: 'Feature';
  id?: string | number;
  geometry: G;
  properties: P;
  bbox?: [number, number, number, number];
}

/**
 * GeoJSON Geometry types
 */
export type Geometry =
  | Point
  | MultiPoint
  | LineString
  | MultiLineString
  | Polygon
  | MultiPolygon
  | GeometryCollection;

export interface Point {
  type: 'Point';
  coordinates: [number, number] | [number, number, number];
}

export interface MultiPoint {
  type: 'MultiPoint';
  coordinates: Array<[number, number] | [number, number, number]>;
}

export interface LineString {
  type: 'LineString';
  coordinates: Array<[number, number] | [number, number, number]>;
}

export interface MultiLineString {
  type: 'MultiLineString';
  coordinates: Array<Array<[number, number] | [number, number, number]>>;
}

export interface Polygon {
  type: 'Polygon';
  coordinates: Array<Array<[number, number] | [number, number, number]>>;
}

export interface MultiPolygon {
  type: 'MultiPolygon';
  coordinates: Array<Array<Array<[number, number] | [number, number, number]>>>;
}

export interface GeometryCollection {
  type: 'GeometryCollection';
  geometries: Geometry[];
}

/**
 * GERS registry entry result
 */
export interface GersRegistryResult {
  /** S3 path to the feature's parquet file */
  filepath: string;
  /** Bounding box of the feature */
  bbox: BoundingBox | null;
  /** GERS version */
  version?: number;
  /** First release this feature appeared */
  firstSeen?: string;
  /** Last release this feature appeared */
  lastSeen?: string;
  /** Last release this feature was modified */
  lastChanged?: string | null;
}

