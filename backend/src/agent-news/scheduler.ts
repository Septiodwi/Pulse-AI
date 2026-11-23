import type { AppStore } from '../domain.js'
import type { AgentNewsExecutor } from './executor.js'

export function startAgentNewsScheduler(store: AppStore, executor: AgentNewsExecutor) {
  let checking = false
  const timer = setInterval(async () => {
    if (checking) return
    checking = true
    try { for (const agent of await store.listDueAgentNews(new Date().toISOString())) await executor.enqueue(agent.id, 'SCHEDULED').catch(() => undefined) }
    catch { console.error('Failed to check scheduled agent jobs') }
    finally { checking = false }
  }, 30_000)
  timer.unref()
  return () => clearInterval(timer)
}
