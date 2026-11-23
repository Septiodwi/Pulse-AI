import { providerFetch } from '../security/provider-fetch.js'
export interface ApifyRun { id: string; status: string; defaultDatasetId?: string; startedAt?: string; finishedAt?: string; usageUsd?: number; usage?: Record<string, unknown> }

export class ApifyClient {
  constructor(private readonly baseUrl: string, private readonly token: string, private readonly fetcher: typeof fetch = fetch) {}
  private async request<T>(path: string, options: RequestInit = {}) {
    const response = await providerFetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, { signal: AbortSignal.timeout(30_000), ...options, headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json', ...options.headers } }, this.fetcher)
    if (response.status === 401) throw new Error('APIFY_INVALID_TOKEN')
    if (response.status === 429) throw new Error('APIFY_RATE_LIMIT')
    if (!response.ok) throw new Error(`APIFY_HTTP_${response.status}`)
    return await response.json() as T
  }
  async startActor(actorId: string, input: Record<string, unknown>) { const result = await this.request<{ data: ApifyRun }>(`/acts/${actorId.replace('/', '~')}/runs`, { method: 'POST', body: JSON.stringify(input) }); return result.data }
  async getRun(runId: string) { return (await this.request<{ data: ApifyRun }>(`/actor-runs/${runId}`)).data }
  async waitForRun(runId: string, timeoutMs = 20 * 60_000) { const deadline = Date.now() + timeoutMs; while (Date.now() < deadline) { const run = await this.getRun(runId); if (['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(run.status)) return run; await new Promise((resolve) => setTimeout(resolve, 2000)) } throw new Error('APIFY_TIMEOUT') }
  async getDatasetItems(datasetId: string) { const items: Record<string, unknown>[] = []; for (let offset = 0; ; offset += 1000) { const page = await this.request<Record<string, unknown>[]>(`/datasets/${datasetId}/items?clean=true&format=json&limit=1000&offset=${offset}`); items.push(...page); if (page.length < 1000) return items } }
}
