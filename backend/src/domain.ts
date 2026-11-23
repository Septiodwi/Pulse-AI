export type UserRole = 'ADMIN' | 'USER'

export const userModules = ['accounts', 'products', 'agent-news', 'content', 'settings'] as const
export type UserModule = typeof userModules[number]
export interface UserAccess {
  modules: UserModule[]
  accountIds: string[]
}

export interface UserRecord {
  id: string
  name: string
  email: string
  phone: string | null
  passwordHash: string
  role: UserRole
  isActive: boolean
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  access: UserAccess | null
}

export type PublicUser = Omit<UserRecord, 'passwordHash' | 'deletedAt'>

export interface CreateUserInput {
  access?: UserAccess | null
  name: string
  email: string
  phone?: string | null
  passwordHash: string
  role: UserRole
  isActive: boolean
}

export interface UpdateUserInput {
  access?: UserAccess | null
  name?: string
  email?: string
  phone?: string | null
  passwordHash?: string
  role?: UserRole
  isActive?: boolean
}

export interface SessionRecord {
  tokenHash: string
  userId: string
  expiresAt: string
}

export interface ProductRecord {
  id: string
  name: string
  productImage: string
  productImageName: string
  baseImage: string
  baseImageName: string
  description: string
  productType: string
  branding: string
  linkedAccounts: string[]
  createdAt: string
  updatedAt: string
}

export interface CreateProductInput {
  name: string
  productImage: string
  productImageName: string
  baseImage: string
  baseImageName: string
  description: string
  productType: string
  branding: string
  linkedAccounts: string[]
}

export type UpdateProductInput = Partial<CreateProductInput>

export type AgentNewsStatus = 'ACTIVE' | 'PAUSED'
export type AgentNewsPlatform = 'INSTAGRAM' | 'TIKTOK' | 'THREADS'
export type ExecutionStatus = 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED'

export interface AgentNewsSource {
  id: string
  platform: AgentNewsPlatform
  actorId: string
  isEnabled: boolean
  config: Record<string, unknown>
}

export interface AgentNewsRecord {
  id: string
  name: string
  description: string
  status: AgentNewsStatus
  imageCount?: number | undefined
  frequencyMinutes: number
  activeDays: number[]
  startTime: string
  endTime: string
  timezone: string
  generalKeywords: string[]
  productIds: string[]
  products: Array<Pick<ProductRecord, 'id' | 'name' | 'productImage'>>
  sources: AgentNewsSource[]
  lastAttemptAt: string | null
  lastSuccessAt: string | null
  lastExecutionStatus: ExecutionStatus | null
  nextRunAt: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface CreateAgentNewsInput {
  name: string
  description: string
  status: AgentNewsStatus
  imageCount?: number | undefined
  frequencyMinutes: number
  activeDays: number[]
  startTime: string
  endTime: string
  timezone: string
  generalKeywords: string[]
  productIds: string[]
  sources: Array<Omit<AgentNewsSource, 'id'>>
  createdBy: string
  nextRunAt: string | null
}

export interface AgentNewsExecution {
  id: string
  agentId: string
  agentName: string
  triggerType: 'MANUAL' | 'SCHEDULED'
  status: ExecutionStatus
  startedAt: string | null
  completedAt: string | null
  errorMessage: string | null
  createdAt: string
}

export interface AgentNewsSourceRun { id: string; executionId: string; platform: AgentNewsPlatform; actorId: string; apifyRunId: string | null; datasetId: string | null; status: ExecutionStatus; startedAt: string | null; completedAt: string | null; resultsCount: number; newItemsCount: number; duplicateItemsCount: number; errorMessage: string | null; usageMetadata: Record<string, unknown> | null }

export interface AgentNewsContent {
  id: string
  agentId: string
  agentName: string
  executionId: string
  platform: AgentNewsPlatform
  externalPostId: string
  postUrl: string | null
  author: string | null
  text: string | null
  thumbnailUrl: string | null
  searchTerm: string | null
  productIds: string[]
  publishedAt: string | null
  retrievedAt: string
  engagement: Record<string, unknown>
  recommendation: 'PENDING' | 'RECOMMENDED' | 'NOT_RECOMMENDED' | 'FAILED'
  relevanceScore: number | null
  analysisReason: string | null
  matchedProductIds: string[]
  analyzedAt: string | null
  analysisModel: string | null
}

export type AgentNewsContentInput = Omit<AgentNewsContent, 'id' | 'agentName' | 'recommendation' | 'relevanceScore' | 'analysisReason' | 'matchedProductIds' | 'analyzedAt' | 'analysisModel'> & { sourceRunId: string; raw: Record<string, unknown> }

export interface AppSettings {
  appName: string
  timezone: string
  defaultLanguage: string
  contentConceptPrompt: string | null
  contentImagePrompt: string | null
  llmEnabled: boolean
  llmBaseUrl: string
  llmModel: string
  llmApiKeyEncrypted: string | null
  agentEnabled: boolean
  agentIntervalValue: number
  agentIntervalUnit: 'minutes' | 'hours' | 'days'
  agentActiveDays: number[]
  agentStartTime: string
  agentEndTime: string
  tebarEnabled: boolean
  tebarBaseUrl: string
  tebarProfile: string | null
  tebarApiKeyEncrypted: string | null
  apifyEnabled: boolean
  apifyBaseUrl: string
  apifyApiTokenEncrypted: string | null
}

export interface AppStore {
  findUserById(id: string): Promise<UserRecord | null>
  findUserByEmail(email: string): Promise<UserRecord | null>
  listUsers(search?: string): Promise<UserRecord[]>
  createUser(input: CreateUserInput): Promise<UserRecord>
  updateUser(id: string, input: UpdateUserInput): Promise<UserRecord | null>
  softDeleteUser(id: string): Promise<boolean>
  createSession(session: SessionRecord): Promise<void>
  findSession(tokenHash: string): Promise<SessionRecord | null>
  deleteSession(tokenHash: string): Promise<void>
  deleteSessionsForUser(userId: string): Promise<void>
  getSettings(): Promise<AppSettings>
  updateSettings(settings: AppSettings): Promise<AppSettings>
  listProducts(search?: string): Promise<ProductRecord[]>
  findProductById(id: string): Promise<ProductRecord | null>
  createProduct(input: CreateProductInput): Promise<ProductRecord>
  updateProduct(id: string, input: UpdateProductInput, expectedLinks?: string[]): Promise<ProductRecord | null>
  deleteProduct(id: string): Promise<boolean>
  listAgentNews(search?: string): Promise<AgentNewsRecord[]>
  findAgentNewsById(id: string): Promise<AgentNewsRecord | null>
  createAgentNews(input: CreateAgentNewsInput): Promise<AgentNewsRecord>
  updateAgentNews(id: string, input: Partial<CreateAgentNewsInput>): Promise<AgentNewsRecord | null>
  deleteAgentNews(id: string): Promise<boolean>
  listDueAgentNews(now: string): Promise<AgentNewsRecord[]>
  createAgentNewsExecution(agentId: string, triggerType: AgentNewsExecution['triggerType']): Promise<AgentNewsExecution>
  updateAgentNewsExecution(id: string, input: Partial<Pick<AgentNewsExecution, 'status' | 'startedAt' | 'completedAt' | 'errorMessage'>>): Promise<void>
  listAgentNewsExecutions(agentId?: string): Promise<AgentNewsExecution[]>
  listAgentNewsSourceRuns(executionId?: string): Promise<AgentNewsSourceRun[]>
  hasRunningAgentNewsExecution(agentId: string): Promise<boolean>
  updateAgentNewsRuntime(agentId: string, input: { lastAttemptAt?: string; lastSuccessAt?: string; lastExecutionStatus?: ExecutionStatus; nextRunAt?: string | null }): Promise<void>
  createAgentNewsSourceRun(input: { executionId: string; sourceId: string; actorId: string; platform: AgentNewsPlatform; status: ExecutionStatus; apifyRunId?: string | null; datasetId?: string | null }): Promise<string>
  updateAgentNewsSourceRun(id: string, input: Record<string, unknown>): Promise<void>
  saveAgentNewsContents(input: AgentNewsContentInput[]): Promise<{ inserted: number; duplicates: number; insertedIds: string[] }>
  listAgentNewsContents(): Promise<AgentNewsContent[]>
  updateAgentNewsContentAnalysis(id: string, input: Pick<AgentNewsContent, 'recommendation' | 'relevanceScore' | 'analysisReason' | 'matchedProductIds' | 'analyzedAt' | 'analysisModel'>): Promise<void>
}

export function toPublicUser(user: UserRecord): PublicUser {
  const { passwordHash: _passwordHash, deletedAt: _deletedAt, ...publicUser } = user
  return publicUser
}
