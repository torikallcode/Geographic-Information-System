import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { pool } from '../db';
import { notFound } from '../utils/http';

const paramsSchema = z.object({
  layerId: z.string().uuid(),
  z: z.coerce.number().int().min(0).max(22),
  x: z.coerce.number().int().min(0),
  y: z.coerce.number().int().min(0),
});

const TILE_QUERY = `
WITH source AS (
  SELECT
    ST_SimplifyPreserveTopology(ST_Transform(f.geom, 3857), $4) AS geom,
    f.fid,
    (
      SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
      FROM jsonb_each(f.attributes)
      WHERE key NOT IN (SELECT jsonb_array_elements_text(l.hidden_attributes))
    ) AS attributes
  FROM features f
  JOIN layers l ON l.id = f.layer_id
  WHERE f.layer_id = $5
    AND l.status = 'published'
    AND f.geom && ST_Transform(ST_TileEnvelope($1, $2, $3), 4326)
)
SELECT ST_AsMVT(tile, 'features', 4096, 'geom') AS tile
FROM (
  SELECT
    ST_AsMVTGeom(geom, ST_TileEnvelope($1, $2, $3), 4096, 64, true) AS geom,
    fid,
    attributes
  FROM source
) tile
WHERE tile.geom IS NOT NULL
`;

const tileRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/:layerId/:z/:x/:y',
    { config: { rateLimit: { max: 6000, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { layerId, z, x, y } = paramsSchema.parse(request.params);

      if (x >= 2 ** z || y >= 2 ** z) {
        throw notFound('Tile tidak tersedia.');
      }

      const layer = await pool.query<{ status: string }>('SELECT status FROM layers WHERE id = $1', [layerId]);
      if (layer.rows.length === 0 || layer.rows[0].status !== 'published') {
        throw notFound('Tile tidak tersedia.');
      }

      const tolerance = Math.max(0, 156543.03392804097 / Math.pow(2, z) / 8);
      const result = await pool.query<{ tile: Buffer | null }>(TILE_QUERY, [z, x, y, tolerance, layerId]);
      const tile = result.rows[0]?.tile;

      reply.header('Content-Type', 'application/x-protobuf');
      reply.header('X-Tile-Source', 'postgis-st-asmvt');
      reply.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
      if (!tile || tile.length === 0) return reply.code(204).send();
      return reply.send(tile);
    },
  );
};

export default tileRoutes;
