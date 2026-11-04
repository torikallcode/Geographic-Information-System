import dotenv from 'dotenv';
import path from 'node:path';
import { z } from 'zod';

dotenv.config({ path: [path.resolve(process.cwd(), '.env'), path.resolve(process.cwd(), '../../.env')] });

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('8h'),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_MB: z.coerce.number().default(50),
  EXPOSE_RESET_TOKEN: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  NOMINATIM_URL: z.string().default('https://nominatim.openstreetmap.org'),
  NOMINATIM_USER_AGENT: z.string().default('GIS-Tata-Ruang/1.0'),
  NODE_ENV: z.string().default('development'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Konfigurasi environment tidak valid:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isDev = env.NODE_ENV !== 'production';
