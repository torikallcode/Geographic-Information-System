export type Role = 'editor' | 'admin';
export type LayerStatus = 'draft' | 'submitted' | 'published' | 'archived';
export type Category = 'pola_ruang' | 'administrasi' | 'infrastruktur' | 'aset' | 'risiko';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  unit?: string | null;
}

export interface Classification {
  field: string;
  classes: Array<{ value: string; color: string; label?: string }>;
  fallbackColor?: string;
}

export interface LayerStyle {
  fillColor?: string;
  fillOpacity?: number;
  lineColor?: string;
  lineWidth?: number;
  lineOpacity?: number;
  circleColor?: string;
  circleRadius?: number;
  circleStrokeColor?: string;
  classification?: Classification;
}

export interface LegendItem {
  label: string;
  color: string;
  description?: string;
}

export interface Layer {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  category: Category;
  geometry_type: string;
  status: LayerStatus;
  source?: string | null;
  data_date?: string | null;
  metadata: Record<string, unknown>;
  attribute_labels: Record<string, string>;
  hidden_attributes: string[];
  feature_count: number;
  sort_order?: number;
  style: LayerStyle;
  legend: LegendItem[];
  bbox?: [number, number, number, number] | null;
  published_at?: string | null;
  updated_at?: string;
  owner_id?: string | null;
  owner_name?: string | null;
  source_crs?: string;
  current_version?: number;
  rejection_note?: string | null;
  submitted_at?: string | null;
  created_at?: string;
}

export interface ValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  featureIndex?: number;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  featureCount: number;
  geometryTypes: string[];
  totalAreaM2: number;
  totalLengthKm: number;
  vertexCount: number;
}

export interface GeoFeature {
  type: 'Feature';
  id?: string | number;
  geometry: { type: string; coordinates: unknown } | null;
  properties: Record<string, unknown> | null;
}

export interface FeatureCollection {
  type: 'FeatureCollection';
  features: GeoFeature[];
}

export interface LayerVersion {
  version: number;
  change_summary: string | null;
  feature_count: number;
  created_at: string;
  created_by_name?: string | null;
}

export interface AnalysisHistoryItem {
  id: string;
  type: string;
  params: Record<string, unknown>;
  summary: Record<string, unknown> | null;
  layer_id: string | null;
  created_at: string;
  created_by_name?: string | null;
  saved_layer_name?: string | null;
}

export interface AuditLog {
  id: number;
  action: string;
  object_type: string;
  object_id: string | null;
  details: Record<string, unknown>;
  ip: string | null;
  created_at: string;
  user_name: string | null;
  user_email?: string | null;
}

export interface DashboardData {
  summary: {
    layers: number;
    features: number;
    users: number;
    published: number;
    draft: number;
    submitted: number;
    archived: number;
  };
  categories: Record<string, { layers: number; features: number }>;
  visits: Array<{ day: string; visits: number }>;
  recentActivity: AuditLog[];
  topLayers: Array<{ id: string; name: string; status: LayerStatus; category: Category; feature_count: number }>;
  totalUsers: number;
}

export interface LocationMatch {
  layer_id: string;
  layer_name: string;
  category: Category;
  fid: string;
  attributes: Record<string, unknown>;
  attribute_labels: Record<string, string>;
  metadata: Record<string, unknown>;
  rules: unknown;
  style: LayerStyle;
  legend: LegendItem[];
}

export interface SelectedFeature {
  layerId: string;
  layerName: string;
  properties: Record<string, unknown>;
  attributeLabels: Record<string, string>;
}

export interface MapSelection {
  lngLat: [number, number];
  loading: boolean;
  address: string | null;
  matches: LocationMatch[];
  feature: SelectedFeature | null;
  error?: string | null;
  outsideMessage?: string | null;
}

export interface MeasureState {
  mode: 'distance' | 'area' | null;
  points: Array<[number, number]>;
  finished: boolean;
}

export interface ImportPreview {
  importId: string;
  filename: string;
  sourceCrs: string;
  detectedCrs: string;
  featureCount: number;
  geometryType: string;
  geometryTypes: string[];
  fields: string[];
  validation: ValidationResult;
  warnings: string[];
  bbox: [number, number, number, number] | null;
  preview: FeatureCollection;
}
