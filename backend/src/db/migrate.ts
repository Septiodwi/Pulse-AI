import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'
import { loadEnvironment } from '../config.js'

const environment = loadEnvironment()
const migrationDirectory = fileURLToPath(new URL('../../migrations/', import.meta.url))
const connection = await mysql.createConnection({
  host: environment.DATABASE_HOST,
  port: environment.DATABASE_PORT,
  database: environment.DATABASE_NAME,
  user: environment.DATABASE_USER,
  password: environment.DATABASE_PASSWORD,
  multipleStatements: true,
})

try {
  const [[lock]] = await connection.query<Array<mysql.RowDataPacket & { acquired: number }>>(
    "SELECT GET_LOCK(CONCAT('pulse:', LEFT(SHA2(DATABASE(), 256), 58)), 0) AS acquired",
  )
  if (lock?.acquired !== 1) throw new Error('A Pulse API process or migration owns this database')

  const migrationFiles = (await readdir(migrationDirectory))
    .filter((file) => file.endsWith('.sql'))
    .sort()

  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  const [appliedRows] = await connection.query<Array<mysql.RowDataPacket & { name: string }>>(
    'SELECT name FROM schema_migrations',
  )
  const applied = new Set(appliedRows.map((row) => row.name))

  for (const file of migrationFiles) {
    if (applied.has(file)) continue
    const sql = await readFile(`${migrationDirectory}/${file}`, 'utf8')
    await connection.query(sql)
    await connection.execute('INSERT INTO schema_migrations (name) VALUES (?)', [file])
  }
  console.log(`Database migration complete (${migrationFiles.length - applied.size} applied)`)
} finally {
  await connection.end()
}
