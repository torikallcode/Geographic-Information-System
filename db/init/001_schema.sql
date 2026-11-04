-- Skema basis data GIS Tata Ruang (PostgreSQL + PostGIS)
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$
BEGIN
  CREATE TYPE user_role AS ENUM ('editor', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE layer_status AS ENUM ('draft', 'submitted', 'published', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email CITEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'editor',
  unit TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS layers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('pola_ruang', 'administrasi', 'infrastruktur', 'aset', 'risiko')),
  geometry_type TEXT NOT NULL CHECK (geometry_type IN ('Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon', 'Geometry')),
  source_crs TEXT NOT NULL DEFAULT 'EPSG:4326',
  status layer_status NOT NULL DEFAULT 'draft',
  source TEXT,
  data_date DATE,
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  attribute_labels JSONB NOT NULL DEFAULT '{}'::jsonb,
  hidden_attributes JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  current_version INTEGER NOT NULL DEFAULT 0,
  rejection_note TEXT,
  submitted_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE layers ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_layers_status ON layers(status);
CREATE INDEX IF NOT EXISTS idx_layers_category ON layers(category);
CREATE INDEX IF NOT EXISTS idx_layers_owner ON layers(owner_id);
CREATE INDEX IF NOT EXISTS idx_layers_name_trgm ON layers USING gin (name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS features (
  id BIGSERIAL PRIMARY KEY,
  fid TEXT NOT NULL,
  layer_id UUID NOT NULL REFERENCES layers(id) ON DELETE CASCADE,
  geom GEOMETRY(Geometry, 4326) NOT NULL,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (layer_id, fid)
);

CREATE INDEX IF NOT EXISTS idx_features_layer ON features(layer_id);
CREATE INDEX IF NOT EXISTS idx_features_geom ON features USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_features_attrs ON features USING GIN (attributes);

CREATE TABLE IF NOT EXISTS layer_styles (
  layer_id UUID PRIMARY KEY REFERENCES layers(id) ON DELETE CASCADE,
  style JSONB NOT NULL DEFAULT '{}'::jsonb,
  legend JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS layer_versions (
  id BIGSERIAL PRIMARY KEY,
  layer_id UUID NOT NULL REFERENCES layers(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  change_summary TEXT,
  snapshot JSONB NOT NULL,
  feature_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (layer_id, version)
);

CREATE INDEX IF NOT EXISTS idx_layer_versions_layer ON layer_versions(layer_id, version DESC);

CREATE TABLE IF NOT EXISTS analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('buffer', 'intersect', 'radius', 'statistics')),
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  layer_id UUID REFERENCES layers(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS site_stats (
  day DATE PRIMARY KEY,
  visits INTEGER NOT NULL DEFAULT 0
);

-- View bantu: seluruh fitur dari layer terbit (dipakai ekspor & tile server)
CREATE OR REPLACE VIEW published_features AS
SELECT f.id, f.fid, f.layer_id, f.geom, f.attributes
FROM features f
JOIN layers l ON l.id = f.layer_id
WHERE l.status = 'published';

DROP TRIGGER IF EXISTS trg_users_updated ON users;
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_layers_updated ON layers;
CREATE TRIGGER trg_layers_updated BEFORE UPDATE ON layers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_features_updated ON features;
CREATE TRIGGER trg_features_updated BEFORE UPDATE ON features FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_styles_updated ON layer_styles;
CREATE TRIGGER trg_styles_updated BEFORE UPDATE ON layer_styles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
