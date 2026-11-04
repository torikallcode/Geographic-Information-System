import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { pool, query, queryOne } from '../db';
import type { Role } from '../types';
import { loginSchema, passwordSchema } from '../schemas';
import { hashPassword, verifyPassword, createResetToken, hashToken, passwordIssues } from '../utils/password';
import { recordAudit } from '../utils/audit';
import { badRequest, unauthorized } from '../utils/http';

const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const user = await queryOne<{
      id: string;
      name: string;
      email: string;
      password_hash: string;
      role: Role;
      unit: string | null;
      is_active: boolean;
    }>('SELECT id, name, email, password_hash, role, unit, is_active FROM users WHERE email = $1', [body.email]);

    if (!user || !verifyPassword(body.password, user.password_hash)) {
      return reply.code(401).send({ error: 'Email atau kata sandi salah.' });
    }
    if (!user.is_active) {
      return reply.code(403).send({ error: 'Akun Anda dinonaktifkan. Hubungi admin.' });
    }

    const token = app.jwt.sign({ sub: user.id, role: user.role, name: user.name, email: user.email });
    await recordAudit(pool, {
      userId: user.id,
      action: 'login',
      objectType: 'auth',
      objectId: user.id,
      ip: request.ip,
    });

    return {
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, unit: user.unit },
    };
  });

  app.get('/me', { preHandler: [app.authenticate] }, async (request) => ({ user: request.authUser }));

  app.post('/forgot-password', { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } }, async (request) => {
    const { email } = z.object({ email: z.string().email() }).parse(request.body);
    const user = await queryOne<{ id: string }>('SELECT id FROM users WHERE email = $1 AND is_active = TRUE', [email]);

    let resetToken: string | undefined;
    if (user) {
      const { token, hash } = createResetToken();
      await query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, now() + interval '1 hour')`,
        [user.id, hash],
      );
      resetToken = token;
      if (process.env.NODE_ENV !== 'production') {
        request.log.warn({ userId: user.id }, 'Token reset kata sandi dibuat (mode pengembangan)');
      }
    }

    return {
      message: 'Jika email terdaftar, tautan reset kata sandi telah dibuat.',
      ...(resetToken ? { resetToken } : {}),
    };
  });

  app.post('/reset-password', async (request) => {
    const body = z
      .object({
        token: z.string().min(10),
        password: passwordSchema,
      })
      .parse(request.body);

    const issues = passwordIssues(body.password);
    if (issues.length > 0) throw badRequest(issues.join(' '));

    const record = await queryOne<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
      [hashToken(body.token)],
    );
    if (!record) throw badRequest('Token reset tidak valid atau sudah kedaluwarsa.');

    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashPassword(body.password), record.user_id]);
    await query('UPDATE password_reset_tokens SET used_at = now() WHERE id = $1', [record.id]);
    await query('DELETE FROM password_reset_tokens WHERE user_id = $1 AND id <> $2', [record.user_id, record.id]);
    await recordAudit(pool, {
      userId: record.user_id,
      action: 'reset_password',
      objectType: 'user',
      objectId: record.user_id,
      ip: request.ip,
    });

    return { message: 'Kata sandi berhasil diperbarui. Silakan masuk dengan kata sandi baru.' };
  });

  app.post('/change-password', { preHandler: [app.authenticate] }, async (request) => {
    const body = z
      .object({
        currentPassword: z.string().min(1),
        newPassword: passwordSchema,
      })
      .parse(request.body);

    const issues = passwordIssues(body.newPassword);
    if (issues.length > 0) throw badRequest(issues.join(' '));

    const user = await queryOne<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [
      request.authUser!.id,
    ]);
    if (!user || !verifyPassword(body.currentPassword, user.password_hash)) {
      throw unauthorized('Kata sandi saat ini salah.');
    }

    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashPassword(body.newPassword), request.authUser!.id]);
    await recordAudit(pool, {
      userId: request.authUser!.id,
      action: 'change_password',
      objectType: 'user',
      objectId: request.authUser!.id,
      ip: request.ip,
    });

    return { message: 'Kata sandi berhasil diubah.' };
  });
};

export default authRoutes;
