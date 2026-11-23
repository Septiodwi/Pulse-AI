import mysql from 'mysql2/promise'
import type { Environment } from '../config.js'

export function createPool(environment: Environment) {
  return mysql.createPool({
    host: environment.DATABASE_HOST,
    port: environment.DATABASE_PORT,
    database: environment.DATABASE_NAME,
    user: environment.DATABASE_USER,
    password: environment.DATABASE_PASSWORD,
    connectionLimit: 10,
    dateStrings: true,
    charset: 'utf8mb4',
  })
}
