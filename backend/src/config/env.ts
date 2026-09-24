import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().min(1),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // Not keyed off NODE_ENV: docker compose runs production mode over plain
  // http://localhost, where some browsers drop Secure cookies.
  AUTH_COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export const env = envSchema.parse(process.env);
