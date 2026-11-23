import { z } from 'zod'
import { hashPassword } from '../auth/password.js'
import { loadEnvironment } from '../config.js'
import { createPool } from './pool.js'
import { MySqlStore } from '../store/mysql-store.js'

const seedSchema = z.object({
  ADMIN_NAME: z.string().min(2).default('Pulse Admin'),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(12),
})

const seed = seedSchema.parse(process.env)
const environment = loadEnvironment()
const pool = createPool(environment)
const store = new MySqlStore(pool)

if (await store.findUserByEmail(seed.ADMIN_EMAIL)) {
  console.log('Admin already exists')
} else {
  await store.createUser({
    name: seed.ADMIN_NAME,
    email: seed.ADMIN_EMAIL,
    passwordHash: await hashPassword(seed.ADMIN_PASSWORD),
    role: 'ADMIN',
    isActive: true,
  })
  console.log('Admin created')
}

await pool.end()
