import type { FastifyPluginAsync } from 'fastify';
import { pool } from '../db';

const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.get('/dashboard', { preHandler: [app.authenticate] }, async () => {
    const [statusCounts, categories, totals, visits, recent, topLayers, users] = await Promise.all([
      pool.query<{ status: string; count: number }>('SELECT status, count(*)::int AS count FROM layers GROUP BY status'),
      pool.query<{ category: string; layers: number; features: number }>(
        `SELECT l.category,
                count(*)::int AS layers,
                coalesce(sum(fc.cnt), 0)::int AS features
         FROM layers l
         LEFT JOIN LATERAL (SELECT count(*)::int AS cnt FROM features WHERE layer_id = l.id) fc ON TRUE
         GROUP BY l.category ORDER BY l.category`,
      ),
      pool.query<{ layers: number; features: number; users: number }>(
        `SELECT (SELECT count(*)::int FROM layers) AS layers,
                (SELECT count(*)::int FROM features) AS features,
                (SELECT count(*)::int FROM users WHERE is_active = TRUE) AS users`,
      ),
      pool.query<{ day: string; visits: number }>(
        `SELECT to_char(d.day, 'YYYY-MM-DD') AS day, coalesce(s.visits, 0)::int AS visits
         FROM generate_series(CURRENT_DATE - interval '13 days', CURRENT_DATE, interval '1 day') AS d(day)
         LEFT JOIN site_stats s ON s.day = d.day::date
         ORDER BY d.day`,
      ),
      pool.query(
        `SELECT a.id, a.action, a.object_type, a.object_id, a.details, a.created_at, u.name AS user_name
         FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
         ORDER BY a.created_at DESC LIMIT 12`,
      ),
      pool.query(
        `SELECT l.id, l.name, l.status, l.category, count(f.id)::int AS feature_count
         FROM layers l LEFT JOIN features f ON f.layer_id = l.id
         GROUP BY l.id, l.name, l.status, l.category
         ORDER BY feature_count DESC LIMIT 8`,
      ),
      pool.query<{ count: number }>('SELECT count(*)::int AS count FROM users'),
    ]);

    const statusMap = Object.fromEntries(statusCounts.rows.map((row) => [row.status, row.count]));
    const categoryMap: Record<string, { layers: number; features: number }> = {};
    for (const row of categories.rows) {
      categoryMap[row.category] = { layers: row.layers, features: row.features };
    }

    return {
      summary: {
        layers: totals.rows[0]?.layers ?? 0,
        features: totals.rows[0]?.features ?? 0,
        users: totals.rows[0]?.users ?? 0,
        published: statusMap.published ?? 0,
        draft: statusMap.draft ?? 0,
        submitted: statusMap.submitted ?? 0,
        archived: statusMap.archived ?? 0,
      },
      categories: categoryMap,
      visits: visits.rows,
      recentActivity: recent.rows,
      topLayers: topLayers.rows,
      totalUsers: users.rows[0]?.count ?? 0,
    };
  });
};

export default dashboardRoutes;
