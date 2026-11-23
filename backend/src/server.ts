import type { RowDataPacket } from 'mysql2/promise'
import { ContentGenerator } from './content/generator.js'
import { createApp } from './app.js'
import { AgentNewsExecutor } from './agent-news/executor.js'
import { startAgentNewsScheduler } from './agent-news/scheduler.js'
import { loadEnvironment } from './config.js'
import { createPool } from './db/pool.js'
import { MySqlStore } from './store/mysql-store.js'

const environment = loadEnvironment()
const pool = createPool(environment)
// ponytail: one API process per schema until job ownership moves to a durable worker.
const owner = await pool.getConnection()
const [[lock]] = await owner.execute<Array<RowDataPacket & { acquired: number }>>(
  "SELECT GET_LOCK(CONCAT('pulse:', LEFT(SHA2(DATABASE(), 256), 58)), 0) AS acquired",
)
if (lock?.acquired !== 1) {
  owner.release()
  await pool.end()
  throw new Error('Another Pulse API process owns this database')
}
owner.on('error', () => {
  console.error('Lost Signal Agent ownership connection')
  process.exit(1)
})

await owner.execute(`
  UPDATE agent_news_executions AS job
  JOIN agent_news_agents AS agent ON agent.id = job.agent_id
  LEFT JOIN agent_news_source_runs AS source
    ON source.execution_id = job.id AND source.status IN ('QUEUED', 'RUNNING')
  SET job.status = 'FAILED', job.completed_at = UTC_TIMESTAMP(3), job.error_message = 'API restarted',
      source.status = 'FAILED', source.completed_at = UTC_TIMESTAMP(3), source.error_message = 'API restarted',
      agent.last_execution_status = 'FAILED'
  WHERE job.status IN ('QUEUED', 'RUNNING')
`)

const store = new MySqlStore(pool)
const contentGenerator = new ContentGenerator(pool, store, environment.SETTINGS_ENCRYPTION_KEY)
const agentNewsExecutor = new AgentNewsExecutor(store, environment.SETTINGS_ENCRYPTION_KEY, undefined, undefined, (agent, id) => contentGenerator.fromExecution(agent, id))
const app = createApp({
  store,
  checkDatabase: async () => { await pool.query({ sql: 'SELECT 1', timeout: 2_000 }) },
  agentNewsExecutor,
  contentGenerator,
  config: {
    frontendUrl: environment.FRONTEND_URL,
    sessionTtlHours: environment.SESSION_TTL_HOURS,
    secureCookies: environment.NODE_ENV === 'production',
    rateLimitEnabled: true,
    settingsEncryptionKey: environment.SETTINGS_ENCRYPTION_KEY,
  },
})
const stopScheduler = startAgentNewsScheduler(store, agentNewsExecutor)
void agentNewsExecutor.analyzePending().catch(() => console.error('Failed to analyze pending agent content'))

const server = app.listen(environment.PORT, () => {
  console.log(`Pulse API listening on http://localhost:${environment.PORT}`)
})

async function shutdown() {
  stopScheduler()
  server.close(async () => {
    owner.destroy()
    await pool.end()
    process.exit(0)
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
