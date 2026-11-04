declare module 'shpjs' {
  export interface Shpjs {
    (input: Buffer | ArrayBuffer): Promise<GeoJSON.FeatureCollection>;
    parseZip(input: Buffer | ArrayBuffer): Promise<GeoJSON.FeatureCollection | GeoJSON.FeatureCollection[]>;
  }
  const shp: Shpjs;
  export default shp;
}
