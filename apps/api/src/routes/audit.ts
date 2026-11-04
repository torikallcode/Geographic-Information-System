import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { pool } from '../db';

const auditRoutes: FastifyPluginAsync = async (app) => {
  app.get('/audit-logs', { preHandler: [app.requireRole(['admin'])] }, async (request) => {
    const query = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(5).max(100).default(25),
        action: z.string().max(100).optional(),
        userId: z.string().uuid().optional(),
        objectType: z.string().max(50).optional(),
      })
      .parse(request.query);

    const offset = (query.page - 1) * query.limit;
    const filters = `
      WHERE ($1::text IS NULL OR a.action = $1::text)
        AND ($2::uuid IS NULL OR a.user_id = $2::uuid)
        AND ($3::text IS NULL OR a.object_type = $3::text)
    `;
    const params = [query.action ?? null, query.userId ?? null, query.objectType ?? null];

    const [rows, total] = await Promise.all([
      pool.query(
        `SELECT a.id, a.action, a.object_type, a.object_id, a.details, a.ip, a.created_at, u.name AS user_name, u.email AS user_email
         FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
         ${filters}
         ORDER BY a.created_at DESC
         LIMIT $4 OFFSET $5`,
        [...params, query.limit, offset],
      ),
      pool.query<{ count: number }>(`SELECT count(*)::int AS count FROM audit_logs a ${filters}`, params),
    ]);

    return {
      logs: rows.rows,
      pagination: {
        page: query.page,
        limit: query.limit,
        total: total.rows[0]?.count ?? 0,
        pages: Math.max(1, Math.ceil((total.rows[0]?.count ?? 0) / query.limit)),
      },
    };
  });
};

export default auditRoutes;
