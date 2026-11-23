import { randomUUID } from 'node:crypto'
import type {
  AppSettings,
  AppStore,
  AgentNewsContent,
  AgentNewsContentInput,
  AgentNewsExecution,
  AgentNewsRecord,
  AgentNewsSourceRun,
  CreateAgentNewsInput,
  CreateUserInput,
  CreateProductInput,
  ProductRecord,
  SessionRecord,
  UpdateUserInput,
  UpdateProductInput,
  UserRecord,
} from '../domain.js'

export class MemoryStore implements AppStore {
  private users = new Map<string, UserRecord>()
  private sessions = new Map<string, SessionRecord>()
  private products = new Map<string, ProductRecord>()
  private agents = new Map<string, AgentNewsRecord>()
  private executions = new Map<string, AgentNewsExecution>()
  private sourceRuns = new Map<string, Record<string, unknown>>()
  private contents = new Map<string, AgentNewsContent>()
  private settings: AppSettings = {
    appName: 'Pulse',
    timezone: 'Asia/Jakarta',
    defaultLanguage: 'id',
    contentConceptPrompt: null,
    contentImagePrompt: null,
    llmEnabled: true,
    llmBaseUrl: '',
    llmModel: '',
    llmApiKeyEncrypted: null,
    agentEnabled: false,
    agentIntervalValue: 6,
    agentIntervalUnit: 'hours',
    agentActiveDays: [1, 2, 3, 4, 5],
    agentStartTime: '08:00',
    agentEndTime: '22:00',
    tebarEnabled: false,
    tebarBaseUrl: 'https://api.tebar.app/v1',
    tebarProfile: null,
    tebarApiKeyEncrypted: null,
    apifyEnabled: false,
    apifyBaseUrl: 'https://api.apify.com/v2',
    apifyApiTokenEncrypted: null,
  }

  async findUserById(id: string) {
    const user = this.users.get(id)
    return user && !user.deletedAt ? { ...user } : null
  }

  async findUserByEmail(email: string) {
    const normalized = email.toLowerCase()
    const user = [...this.users.values()].find(
      (candidate) => !candidate.deletedAt && candidate.email === normalized,
    )
    return user ? { ...user } : null
  }

  async listUsers(search = '') {
    const normalized = search.toLowerCase()
    return [...this.users.values()]
      .filter(
        (user) =>
          !user.deletedAt &&
          (!normalized ||
            user.name.toLowerCase().includes(normalized) ||
            user.email.includes(normalized)),
      )
      .map((user) => ({ ...user }))
  }

  async createUser(input: CreateUserInput) {
    const now = new Date().toISOString()
    const user: UserRecord = {
      id: randomUUID(),
      name: input.name,
      email: input.email.toLowerCase(),
      phone: input.phone ?? null,
      passwordHash: input.passwordHash,
      role: input.role,
      access: input.access ?? null,
      isActive: input.isActive,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    this.users = new Map(this.users).set(user.id, user)
    return { ...user }
  }

  async updateUser(id: string, input: UpdateUserInput) {
    const current = await this.findUserById(id)
    if (!current) return null

    const updated: UserRecord = {
      ...current,
      ...input,
      email: input.email?.toLowerCase() ?? current.email,
      updatedAt: new Date().toISOString(),
    }
    this.users = new Map(this.users).set(id, updated)
    return { ...updated }
  }

  async softDeleteUser(id: string) {
    const current = await this.findUserById(id)
    if (!current) return false
    this.users = new Map(this.users).set(id, {
      ...current,
      isActive: false,
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    await this.deleteSessionsForUser(id)
    return true
  }

  async createSession(session: SessionRecord) {
    this.sessions = new Map(this.sessions).set(session.tokenHash, { ...session })
  }

  async findSession(tokenHash: string) {
    const session = this.sessions.get(tokenHash)
    return session ? { ...session } : null
  }

  async deleteSession(tokenHash: string) {
    const sessions = new Map(this.sessions)
    sessions.delete(tokenHash)
    this.sessions = sessions
  }

  async deleteSessionsForUser(userId: string) {
    this.sessions = new Map(
      [...this.sessions].filter(([, session]) => session.userId !== userId),
    )
  }

  async getSettings() {
    return { ...this.settings, agentActiveDays: [...this.settings.agentActiveDays] }
  }

  async updateSettings(settings: AppSettings) {
    this.settings = { ...settings, agentActiveDays: [...settings.agentActiveDays] }
    return this.getSettings()
  }

  async listProducts(search = '') {
    const term = search.trim().toLowerCase()
    return [...this.products.values()]
      .filter((product) => !term || [product.name, product.description, product.productType, product.branding].some((value) => value.toLowerCase().includes(term)))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((product) => ({ ...product, linkedAccounts: [...product.linkedAccounts] }))
  }

  async findProductById(id: string) {
    const product = this.products.get(id)
    return product ? { ...product, linkedAccounts: [...product.linkedAccounts] } : null
  }

  async createProduct(input: CreateProductInput) {
    const now = new Date().toISOString()
    const product: ProductRecord = { id: randomUUID(), ...input, linkedAccounts: [...input.linkedAccounts], createdAt: now, updatedAt: now }
    this.products = new Map(this.products).set(product.id, product)
    return { ...product, linkedAccounts: [...product.linkedAccounts] }
  }

  async updateProduct(id: string, input: UpdateProductInput, expectedLinks?: string[]) {
    const current = await this.findProductById(id)
    if (!current) return null
    if (expectedLinks && JSON.stringify(current.linkedAccounts) !== JSON.stringify(expectedLinks)) return null
    const product: ProductRecord = { ...current, ...input, linkedAccounts: input.linkedAccounts ? [...input.linkedAccounts] : current.linkedAccounts, updatedAt: new Date().toISOString() }
    this.products = new Map(this.products).set(id, product)
    return { ...product, linkedAccounts: [...product.linkedAccounts] }
  }

  async deleteProduct(id: string) {
    if (!this.products.has(id)) return false
    const products = new Map(this.products)
    products.delete(id)
    this.products = products
    return true
  }

  async listAgentNews(search = '') {
    const term = search.toLowerCase()
    return [...this.agents.values()].filter((agent) => !term || agent.name.toLowerCase().includes(term) || agent.description.toLowerCase().includes(term)).map((agent) => structuredClone(agent))
  }

  async findAgentNewsById(id: string) {
    const agent = this.agents.get(id)
    return agent ? structuredClone(agent) : null
  }

  async createAgentNews(input: CreateAgentNewsInput) {
    const now = new Date().toISOString()
    const products = (await Promise.all(input.productIds.map((id) => this.findProductById(id)))).filter((product): product is ProductRecord => Boolean(product)).map(({ id, name, productImage }) => ({ id, name, productImage }))
    const agent: AgentNewsRecord = { id: randomUUID(), ...input, products, productIds: [...input.productIds], generalKeywords: [...input.generalKeywords], activeDays: [...input.activeDays], sources: input.sources.map((source) => ({ ...source, id: randomUUID(), config: structuredClone(source.config) })), lastAttemptAt: null, lastSuccessAt: null, lastExecutionStatus: null, createdAt: now, updatedAt: now }
    this.agents = new Map(this.agents).set(agent.id, agent)
    return structuredClone(agent)
  }

  async updateAgentNews(id: string, input: Partial<CreateAgentNewsInput>) {
    const current = await this.findAgentNewsById(id)
    if (!current) return null
    const productIds = input.productIds ?? current.productIds
    const products = (await Promise.all(productIds.map((productId) => this.findProductById(productId)))).filter((product): product is ProductRecord => Boolean(product)).map(({ id: productId, name, productImage }) => ({ id: productId, name, productImage }))
    const agent: AgentNewsRecord = { ...current, ...input, productIds: [...productIds], products, generalKeywords: [...(input.generalKeywords ?? current.generalKeywords)], activeDays: [...(input.activeDays ?? current.activeDays)], sources: input.sources ? input.sources.map((source) => ({ ...source, id: current.sources.find((item) => item.platform === source.platform)?.id ?? randomUUID(), config: structuredClone(source.config) })) : current.sources, updatedAt: new Date().toISOString() }
    this.agents = new Map(this.agents).set(id, agent)
    return structuredClone(agent)
  }

  async deleteAgentNews(id: string) { const agents = new Map(this.agents); const removed = agents.delete(id); this.agents = agents; return removed }
  async listDueAgentNews(now: string) { return (await this.listAgentNews()).filter((agent) => agent.status === 'ACTIVE' && agent.nextRunAt && agent.nextRunAt <= now) }
  async createAgentNewsExecution(agentId: string, triggerType: AgentNewsExecution['triggerType']) { const agent = await this.findAgentNewsById(agentId); if (!agent) throw new Error('Agent missing'); const execution: AgentNewsExecution = { id: randomUUID(), agentId, agentName: agent.name, triggerType, status: 'QUEUED', startedAt: null, completedAt: null, errorMessage: null, createdAt: new Date().toISOString() }; this.executions = new Map(this.executions).set(execution.id, execution); return { ...execution } }
  async updateAgentNewsExecution(id: string, input: Partial<Pick<AgentNewsExecution, 'status' | 'startedAt' | 'completedAt' | 'errorMessage'>>) { const current = this.executions.get(id); if (current) this.executions = new Map(this.executions).set(id, { ...current, ...input }) }
  async listAgentNewsExecutions(agentId?: string) { return [...this.executions.values()].filter((item) => !agentId || item.agentId === agentId).map((item) => ({ ...item })) }
  async listAgentNewsSourceRuns(executionId?: string) { return [...this.sourceRuns.values()].filter((item) => !executionId || item.executionId === executionId).map((item) => ({ id: String(item.id), executionId: String(item.executionId), platform: item.platform as AgentNewsSourceRun['platform'], actorId: String(item.actorId), apifyRunId: item.apifyRunId ? String(item.apifyRunId) : null, datasetId: item.datasetId ? String(item.datasetId) : null, status: item.status as AgentNewsSourceRun['status'], startedAt: item.startedAt ? String(item.startedAt) : null, completedAt: item.completedAt ? String(item.completedAt) : null, resultsCount: Number(item.resultsCount ?? 0), newItemsCount: Number(item.newItemsCount ?? 0), duplicateItemsCount: Number(item.duplicateItemsCount ?? 0), errorMessage: item.errorMessage ? String(item.errorMessage) : null, usageMetadata: item.usageMetadata as Record<string, unknown> | null ?? null })) }
  async hasRunningAgentNewsExecution(agentId: string) { return [...this.executions.values()].some((item) => item.agentId === agentId && ['QUEUED', 'RUNNING'].includes(item.status)) }
  async updateAgentNewsRuntime(agentId: string, input: { lastAttemptAt?: string; lastSuccessAt?: string; lastExecutionStatus?: AgentNewsRecord['lastExecutionStatus']; nextRunAt?: string | null }) { const current = this.agents.get(agentId); if (current) this.agents = new Map(this.agents).set(agentId, { ...current, ...input, updatedAt: new Date().toISOString() }) }
  async createAgentNewsSourceRun(input: { executionId: string; sourceId: string; actorId: string; platform: AgentNewsRecord['sources'][number]['platform']; status: AgentNewsExecution['status']; apifyRunId?: string | null; datasetId?: string | null }) { const id = randomUUID(); this.sourceRuns = new Map(this.sourceRuns).set(id, { id, ...input }); return id }
  async updateAgentNewsSourceRun(id: string, input: Record<string, unknown>) { const current = this.sourceRuns.get(id); if (current) this.sourceRuns = new Map(this.sourceRuns).set(id, { ...current, ...input }) }
  async saveAgentNewsContents(items: AgentNewsContentInput[]) { let inserted = 0; let duplicates = 0; const insertedIds:string[]=[]; for (const { sourceRunId: _sourceRunId, raw: _raw, ...item } of items) { const key = `${item.agentId}:${item.platform}:${item.externalPostId}`; if (this.contents.has(key)) { duplicates += 1; continue } const agent = await this.findAgentNewsById(item.agentId); const id=randomUUID(); this.contents = new Map(this.contents).set(key, { ...item, id, agentName: agent?.name ?? '', recommendation:'PENDING', relevanceScore:null, analysisReason:null, matchedProductIds:[], analyzedAt:null, analysisModel:null }); insertedIds.push(id); inserted += 1 } return { inserted, duplicates, insertedIds } }
  async listAgentNewsContents() { return [...this.contents.values()].map((item) => structuredClone(item)) }
  async updateAgentNewsContentAnalysis(id:string,input:Pick<AgentNewsContent,'recommendation'|'relevanceScore'|'analysisReason'|'matchedProductIds'|'analyzedAt'|'analysisModel'>){const entry=[...this.contents.entries()].find(([,item])=>item.id===id);if(entry)this.contents=new Map(this.contents).set(entry[0],{...entry[1],...input,matchedProductIds:[...input.matchedProductIds]})}
}
