import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import { env } from './env';
import { pingDatabase, pool } from './db';
import authPlugin from './plugins/auth';
import { AppError } from './utils/http';
import { ensureUploadDirectories } from './services/importService';

import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import publicRoutes from './routes/public';
import layerRoutes from './routes/layers';
import tileRoutes from './routes/tiles';
import importRoutes from './routes/import';
import analysisRoutes from './routes/analysis';
import dashboardRoutes from './routes/dashboard';
import auditRoutes from './routes/audit';

const app = Fastify({
  logger: {
    level: env.NODE_ENV === 'production' ? 'info' : 'warn',
  },
  bodyLimit: 20 * 1024 * 1024,
});

await app.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: false });
await app.register(cors, {
  origin: [env.WEB_ORIGIN, 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:8080'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});
await app.register(rateLimit, {
  max: 300,
  timeWindow: '1 minute',
  allowList: [],
});
await app.register(multipart, {
  limits: {
    fileSize: env.MAX_UPLOAD_MB * 1024 * 1024,
    files: 1,
  },
});
await app.register(authPlugin);

app.setErrorHandler((error, request, reply) => {
  if (error instanceof AppError) {
    return reply.code(error.statusCode).send({ error: error.message, code: error.code, details: error.details });
  }
  if (error instanceof ZodError) {
    return reply.code(400).send({
      error: 'Data yang dikirim tidak valid.',
      details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
  if ((error as { code?: string }).code === '23505') {
    return reply.code(409).send({ error: 'Data sudah ada (duplikat).' });
  }
  if ((error as { code?: string }).code === '22P02') {
    return reply.code(400).send({ error: 'Format ID tidak valid.' });
  }
  if ((error as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
    return reply.code(413).send({ error: `Ukuran berkas melebihi batas ${env.MAX_UPLOAD_MB} MB.` });
  }
  request.log.error(error);
  console.error('Kesalahan API:', error);
  const normalized = error instanceof Error ? error : new Error(String(error));
  return reply.code(500).send({
    error: 'Terjadi kesalahan pada server.',
    ...(env.NODE_ENV !== 'production' ? { debug: { message: normalized.message, stack: normalized.stack } } : {}),
  });
});

app.get('/api/health', async () => {
  try {
    await pingDatabase();
    return { status: 'ok', time: new Date().toISOString() };
  } catch {
    return { status: 'degraded', database: 'unreachable' };
  }
});

await app.register(authRoutes, { prefix: '/api/auth' });
await app.register(userRoutes, { prefix: '/api/users' });
await app.register(publicRoutes, { prefix: '/api/public' });
await app.register(layerRoutes, { prefix: '/api/layers' });
await app.register(tileRoutes, { prefix: '/api/tiles' });
await app.register(importRoutes, { prefix: '/api/import' });
await app.register(analysisRoutes, { prefix: '/api/analysis' });
await app.register(dashboardRoutes, { prefix: '/api' });
await app.register(auditRoutes, { prefix: '/api' });

await ensureUploadDirectories();

const start = async () => {
  try {
    await pingDatabase();
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`API GIS Tata Ruang berjalan di http://localhost:${env.PORT}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

const shutdown = async (signal: string) => {
  app.log.info(`Menerima ${signal}, menutup server...`);
  await app.close();
  await pool.end();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

void start();
