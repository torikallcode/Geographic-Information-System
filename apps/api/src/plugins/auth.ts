import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../env';
import { queryOne } from '../db';
import type { AuthUser, Role } from '../types';

export default fp(async (app) => {
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });

  app.decorateRequest('authUser', null);

  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'Sesi tidak valid atau sudah berakhir. Silakan masuk kembali.' });
    }

    const row = await queryOne<{
      id: string;
      name: string;
      email: string;
      role: Role;
      unit: string | null;
      is_active: boolean;
    }>('SELECT id, name, email, role, unit, is_active FROM users WHERE id = $1', [request.user.sub]);

    if (!row || !row.is_active) {
      return reply.code(401).send({ error: 'Akun tidak ditemukan atau dinonaktifkan.' });
    }

    const user: AuthUser = { id: row.id, name: row.name, email: row.email, role: row.role, unit: row.unit };
    request.authUser = user;
  });

  app.decorate('requireRole', (roles: Role[]) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      await app.authenticate(request, reply);
      if (reply.sent) return;
      if (!request.authUser || !roles.includes(request.authUser.role)) {
        return reply.code(403).send({ error: 'Peran akun Anda tidak memiliki akses ke tindakan ini.' });
      }
    };
  });
});
