export type Role = 'editor' | 'admin';
export type LayerStatus = 'draft' | 'submitted' | 'published' | 'archived';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  unit: string | null;
}

export interface LayerRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  geometry_type: string;
  source_crs: string;
  status: LayerStatus;
  source: string | null;
  data_date: string | null;
  owner_id: string | null;
  owner_name?: string | null;
  metadata: Record<string, unknown>;
  attribute_labels: Record<string, string>;
  hidden_attributes: string[];
  sort_order: number;
  current_version: number;
  rejection_note: string | null;
  submitted_at: string | null;
  published_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  feature_count?: number;
  style?: LayerStyle | null;
  legend?: LegendItem[];
  bbox?: [number, number, number, number] | null;
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
  classification?: {
    field: string;
    classes: Array<{ value: string; color: string; label?: string }>;
    fallbackColor?: string;
  };
}

export interface LegendItem {
  label: string;
  color: string;
  description?: string;
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

declare module 'fastify' {
  interface FastifyRequest {
    authUser: AuthUser | null;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (roles: Role[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; role: Role; name: string; email: string };
    user: { sub: string; role: Role; name: string; email: string };
  }
}
