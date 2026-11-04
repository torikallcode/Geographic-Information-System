import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { pool, query, queryOne } from '../db';
import { passwordIssues, hashPassword } from '../utils/password';
import { recordAudit } from '../utils/audit';
import { badRequest, conflict, notFound } from '../utils/http';
import { passwordSchema } from '../schemas';

const userRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireRole(['admin']));

  app.get('/', async () => {
    const rows = await query(
      `SELECT id, name, email, role, unit, is_active, created_at, updated_at
       FROM users ORDER BY name ASC`,
    );
    return { users: rows };
  });

  app.post('/', async (request, reply) => {
    const body = z
      .object({
        name: z.string().trim().min(2).max(120),
        email: z.string().trim().email(),
        password: passwordSchema,
        role: z.enum(['editor', 'admin']),
        unit: z.string().trim().max(150).optional().default(''),
      })
      .parse(request.body);

    const issues = passwordIssues(body.password);
    if (issues.length > 0) throw badRequest(issues.join(' '));

    const existing = await queryOne('SELECT id FROM users WHERE email = $1', [body.email]);
    if (existing) throw conflict('Email sudah terdaftar.');

    const created = await queryOne(
      `INSERT INTO users (name, email, password_hash, role, unit)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, role, unit, is_active, created_at`,
      [body.name, body.email, hashPassword(body.password), body.role, body.unit],
    );

    await recordAudit(pool, {
      userId: request.authUser!.id,
      action: 'create_user',
      objectType: 'user',
      objectId: (created as { id: string }).id,
      details: { email: body.email, role: body.role },
      ip: request.ip,
    });

    return reply.code(201).send({ user: created });
  });

  app.patch('/:id', async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z
      .object({
        name: z.string().trim().min(2).max(120).optional(),
        role: z.enum(['editor', 'admin']).optional(),
        unit: z.string().trim().max(150).optional(),
        isActive: z.boolean().optional(),
        password: passwordSchema.optional(),
      })
      .parse(request.body);

    const existing = await queryOne<{ id: string; role: string }>('SELECT id, role FROM users WHERE id = $1', [id]);
    if (!existing) throw notFound('Pengguna tidak ditemukan.');

    if (id === request.authUser!.id && body.role && body.role !== 'admin') {
      throw badRequest('Anda tidak dapat menurunkan peran akun Anda sendiri.');
    }
    if (id === request.authUser!.id && body.isActive === false) {
      throw badRequest('Anda tidak dapat menonaktifkan akun Anda sendiri.');
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    const push = (column: string, value: unknown) => {
      values.push(value);
      updates.push(`${column} = $${values.length}`);
    };

    if (body.name !== undefined) push('name', body.name);
    if (body.role !== undefined) push('role', body.role);
    if (body.unit !== undefined) push('unit', body.unit);
    if (body.isActive !== undefined) push('is_active', body.isActive);
    if (body.password !== undefined) {
      const issues = passwordIssues(body.password);
      if (issues.length > 0) throw badRequest(issues.join(' '));
      push('password_hash', hashPassword(body.password));
    }

    if (updates.length === 0) throw badRequest('Tidak ada perubahan yang dikirim.');

    values.push(id);
    const updated = await queryOne(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${values.length}
       RETURNING id, name, email, role, unit, is_active, updated_at`,
      values,
    );

    await recordAudit(pool, {
      userId: request.authUser!.id,
      action: 'update_user',
      objectType: 'user',
      objectId: id,
      details: { fields: Object.keys(body) },
      ip: request.ip,
    });

    return { user: updated };
  });
};

export default userRoutes;
