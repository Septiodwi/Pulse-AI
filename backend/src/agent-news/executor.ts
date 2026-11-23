import type { AgentNewsPlatform, AgentNewsRecord, AppStore } from '../domain.js'
import { ApiError } from '../errors.js'
import { decryptSecret } from '../security/encrypted-secret.js'
import { ApifyClient } from './apify-client.js'
import { InstagramHashtagAdapter, ThreadsKeywordAdapter, TikTokHashtagAdapter } from './adapters.js'
import { calculateNextRun } from './schedule.js'
import { AgentNewsContentAnalyzer } from './content-analyzer.js'

const adapters = { INSTAGRAM: InstagramHashtagAdapter, TIKTOK: TikTokHashtagAdapter, THREADS: ThreadsKeywordAdapter }
type Adapter = typeof InstagramHashtagAdapter | typeof TikTokHashtagAdapter | typeof ThreadsKeywordAdapter

function friendlyError(platform: AgentNewsPlatform, cause: unknown) {
  const code = cause instanceof Error ? cause.message : ''
  if (code === 'APIFY_INVALID_TOKEN') return 'Koneksi Apify gagal. Token API tidak valid.'
  if (code === 'APIFY_RATE_LIMIT') return 'Batas permintaan Apify tercapai. Coba kembali nanti.'
  if (code === 'APIFY_TIMEOUT') return `Monitoring ${platform} melewati batas waktu.`
  return `Monitoring ${platform} gagal. Periksa riwayat eksekusi.`
}

export function isWithinMonitoringWindow(publishedAt: string | null, retrievedAt: string, frequencyMinutes: number) {
  if (!publishedAt) return false
  const published = Date.parse(publishedAt)
  const retrieved = Date.parse(retrievedAt)
  if (!Number.isFinite(published) || !Number.isFinite(retrieved)) return false
  return published >= retrieved - frequencyMinutes * 60_000 && published <= retrieved
}

export class AgentNewsExecutor {
  private active = 0
  private readonly admitting = new Set<string>()
  private readonly cooldown = new Map<string, number>()
  private readonly analyzer: AgentNewsContentAnalyzer
  constructor(private readonly store: AppStore, private readonly encryptionKey: string, private readonly clientFactory = (baseUrl: string, token: string) => new ApifyClient(baseUrl, token), analyzer?:AgentNewsContentAnalyzer, private readonly onRecommendations?: (agent: AgentNewsRecord, executionId: string) => Promise<unknown>) { this.analyzer=analyzer??new AgentNewsContentAnalyzer(store,encryptionKey) }

  async analyzePending() {
    const pending = (await this.store.listAgentNewsContents()).filter((item) => item.recommendation === 'PENDING')
    const byAgent = new Map<string, typeof pending>()
    for (const item of pending) byAgent.set(item.agentId, [...(byAgent.get(item.agentId) ?? []), item])
    for (const [agentId, items] of byAgent) {
      const agent = await this.store.findAgentNewsById(agentId)
      if (agent) await this.analyzer.analyze(items.map((item) => item.id), agent.productIds, agent.description)
    }
  }

  async enqueue(agentId: string, triggerType: 'MANUAL' | 'SCHEDULED') {
    if (this.admitting.has(agentId)) throw new ApiError(409, 'Agent sedang dijalankan')
    if (this.active + this.admitting.size >= 2) throw new ApiError(429, 'Batas eksekusi bersamaan tercapai. Coba kembali nanti.')
    this.admitting.add(agentId)
    try {
      const agent = await this.store.findAgentNewsById(agentId)
      if (!agent) throw new ApiError(404, 'Agent News tidak ditemukan')
      if (agent.status !== 'ACTIVE') throw new ApiError(409, 'Agent News nonaktif. Aktifkan agent sebelum menjalankan Get Now.')
      if (await this.store.hasRunningAgentNewsExecution(agentId)) throw new ApiError(409, 'Agent sedang dijalankan')
      if (triggerType === 'MANUAL' && (this.cooldown.get(agentId) ?? 0) > Date.now()) throw new ApiError(429, 'Get Now baru saja dijalankan. Coba kembali satu menit lagi.')
      const settings = await this.store.getSettings()
      if (!settings.apifyApiTokenEncrypted) throw new ApiError(400, 'Apify belum dikonfigurasi. Silakan atur API Token pada menu Settings.')
      const client = this.clientFactory(settings.apifyBaseUrl, decryptSecret(settings.apifyApiTokenEncrypted, this.encryptionKey))
      const execution = await this.store.createAgentNewsExecution(agentId, triggerType)
      this.cooldown.set(agentId, Date.now() + 60_000)
      void this.run(agent, execution.id, client).catch(async () => {
        await this.store.updateAgentNewsExecution(execution.id, {
          status: 'FAILED', completedAt: new Date().toISOString(), errorMessage: 'Eksekusi terhenti',
        })
      }).catch(() => console.error('Failed to finalize agent job', execution.id))
      return execution
    } finally {
      this.admitting.delete(agentId)
    }
  }

  private async run(agent: AgentNewsRecord, executionId: string, client: ApifyClient) {
    this.active += 1
    try {
      const startedAt = new Date().toISOString()
      await this.store.updateAgentNewsExecution(executionId, { status: 'RUNNING', startedAt })
      await this.store.updateAgentNewsRuntime(agent.id, { lastAttemptAt: startedAt, lastExecutionStatus: 'RUNNING' })
      const results = await Promise.allSettled(agent.sources.filter((source) => source.isEnabled).map((source) => this.runSource(agent, executionId, source, adapters[source.platform] as Adapter, client)))
      const succeeded = results.filter((result) => result.status === 'fulfilled').length
      const status = succeeded === results.length ? 'SUCCESS' : succeeded > 0 ? 'PARTIAL_SUCCESS' : 'FAILED'
      const completedAt = new Date().toISOString()
      const errors = results.flatMap((result) => result.status === 'rejected' ? [result.reason instanceof Error ? result.reason.message : 'Actor gagal'] : [])
      await this.store.updateAgentNewsExecution(executionId, { status, completedAt, errorMessage: errors.join('; ') || null })
      await this.store.updateAgentNewsRuntime(agent.id, { ...(succeeded > 0 ? { lastSuccessAt: completedAt } : {}), lastExecutionStatus: status, nextRunAt: calculateNextRun(agent, new Date()) })
    } finally { this.active -= 1 }
    await this.onRecommendations?.(agent, executionId).catch(() => console.error('Gagal memproses hasil Signal Agent', executionId))
  }

  private async runSource(agent: AgentNewsRecord, executionId: string, source: AgentNewsRecord['sources'][number], adapter: Adapter, client: ApifyClient) {
    const sourceRunId = await this.store.createAgentNewsSourceRun({ executionId, sourceId: source.id, actorId: source.actorId, platform: source.platform, status: 'QUEUED' })
    try {
      const input = adapter.toActorInput(source.config) as Record<string, unknown>
      const run = await client.startActor(source.actorId, input)
      await this.store.updateAgentNewsSourceRun(sourceRunId, { status: 'RUNNING', apifyRunId: run.id, startedAt: run.startedAt ?? new Date().toISOString() })
      const finished = await client.waitForRun(run.id)
      if (finished.status !== 'SUCCEEDED' || !finished.defaultDatasetId) throw new Error(`Actor ${source.platform} gagal`)
      const items = await client.getDatasetItems(finished.defaultDatasetId)
      const retrievedAt = new Date().toISOString()
      const normalized = items.map((item) => adapter.normalize(item)).filter((item) => item.externalPostId && isWithinMonitoringWindow(item.publishedAt, retrievedAt, agent.frequencyMinutes)).map((item) => ({ agentId: agent.id, executionId, sourceRunId, platform: source.platform as AgentNewsPlatform, externalPostId: item.externalPostId, postUrl: item.postUrl || null, author: item.author || null, text: item.text || null, thumbnailUrl: item.thumbnailUrl || null, searchTerm: item.searchTerm || null, productIds: [...agent.productIds], publishedAt: item.publishedAt, retrievedAt, engagement: item.engagement, raw: item.raw }))
      const saved = await this.store.saveAgentNewsContents(normalized)
      await this.analyzer.analyze(saved.insertedIds, agent.productIds, agent.description)
      await this.store.updateAgentNewsSourceRun(sourceRunId, { status: 'SUCCESS', datasetId: finished.defaultDatasetId, completedAt: finished.finishedAt ?? retrievedAt, resultsCount: items.length, newItemsCount: saved.inserted, duplicateItemsCount: saved.duplicates, usageMetadata: { usageUsd: finished.usageUsd, usage: finished.usage } })
    } catch (cause) {
      const message = friendlyError(source.platform, cause)
      await this.store.updateAgentNewsSourceRun(sourceRunId, { status: 'FAILED', completedAt: new Date().toISOString(), errorMessage: message })
      throw cause
    }
  }
}
