import 'dotenv/config'
import { z } from 'zod'

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(168),
  DATABASE_HOST: z.string().min(1).default('127.0.0.1'),
  DATABASE_PORT: z.coerce.number().int().positive().default(3306),
  DATABASE_NAME: z.string().min(1).default('pulse'),
  DATABASE_USER: z.string().min(1).default('pulse'),
  DATABASE_PASSWORD: z.string().min(1),
  SETTINGS_ENCRYPTION_KEY: z.string().refine(
    (value) => Buffer.from(value, 'base64').length === 32,
    'SETTINGS_ENCRYPTION_KEY must be a base64-encoded 32-byte key',
  ),
})

export type Environment = z.infer<typeof environmentSchema>

export function loadEnvironment(): Environment {
  return environmentSchema.parse(process.env)
}
