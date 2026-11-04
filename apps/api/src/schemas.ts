import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().email('Format email tidak valid.'),
  password: z.string().min(1, 'Kata sandi wajib diisi.'),
});

export const passwordSchema = z.string().min(8, 'Kata sandi minimal 8 karakter.').max(200);

export const layerCategorySchema = z.enum(['pola_ruang', 'administrasi', 'infrastruktur', 'aset', 'risiko']);

export const layerStatusSchema = z.enum(['draft', 'submitted', 'published', 'archived']);

export const geometryTypeSchema = z.enum([
  'Point',
  'LineString',
  'Polygon',
  'MultiPoint',
  'MultiLineString',
  'MultiPolygon',
  'Geometry',
]);

export const styleSchema = z.object({
  fillColor: z.string().optional(),
  fillOpacity: z.number().min(0).max(1).optional(),
  lineColor: z.string().optional(),
  lineWidth: z.number().min(0).max(50).optional(),
  lineOpacity: z.number().min(0).max(1).optional(),
  circleColor: z.string().optional(),
  circleRadius: z.number().min(1).max(40).optional(),
  circleStrokeColor: z.string().optional(),
  classification: z
    .object({
      field: z.string(),
      classes: z.array(z.object({ value: z.string(), color: z.string(), label: z.string().optional() })).max(30),
      fallbackColor: z.string().optional(),
    })
    .optional(),
});

export const legendItemSchema = z.object({
  label: z.string(),
  color: z.string(),
  description: z.string().optional(),
});

export const layerMetaSchema = z.object({
  name: z.string().trim().min(2, 'Nama layer minimal 2 karakter.').max(150),
  description: z.string().trim().max(2000).optional().default(''),
  category: layerCategorySchema,
  source: z.string().trim().max(500).optional().default(''),
  dataDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD.').optional().nullable(),
  metadata: z.record(z.unknown()).optional().default({}),
  attributeLabels: z.record(z.string()).optional().default({}),
  hiddenAttributes: z.array(z.string()).max(50).optional().default([]),
  style: styleSchema.optional(),
  legend: z.array(legendItemSchema).max(30).optional(),
});

export const featureCollectionSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(
    z.object({
      type: z.literal('Feature'),
      id: z.union([z.string(), z.number()]).optional(),
      geometry: z
        .object({
          type: z.string(),
          coordinates: z.unknown(),
        })
        .nullable(),
      properties: z.record(z.unknown()).nullable().optional(),
    }),
  ),
});
