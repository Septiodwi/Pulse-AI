export type UserRole = 'ADMIN' | 'USER'

export type UserModule = 'accounts' | 'products' | 'agent-news' | 'content' | 'settings'

export interface UserAccess {
  modules: UserModule[]
  accountIds: string[]
}

export interface User {
  access?: UserAccess | null
  id: string
  name: string
  email: string
  phone: string | null
  role: UserRole
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface AppSettings {
  appName: string
  timezone: string
  defaultLanguage: string
  agent: {
    enabled: boolean
    intervalValue: number
    intervalUnit: 'minutes' | 'hours' | 'days'
    activeDays: number[]
    startTime: string
    endTime: string
  }
  contentPrompts: { concept: string; image: string; defaults: { concept: string; image: string } }
  llm: {
    enabled: boolean
    baseUrl: string
    model: string
    apiKeyConfigured: boolean
  }
  tebar: {
    enabled: boolean
    baseUrl: string
    profile: string | null
    apiKeyConfigured: boolean
  }
  apify: {
    enabled: boolean
    baseUrl: string
    apiTokenConfigured: boolean
  }
}

export interface ApiEnvelope<T> {
  success: boolean
  data: T
}

export interface Product {
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

export type AgentNewsPlatform = 'INSTAGRAM' | 'TIKTOK' | 'THREADS'
export interface AgentNewsSource { id?: string; platform: AgentNewsPlatform; actorId: string; isEnabled: boolean; config: Record<string, unknown> }
export interface AgentNews { id: string; name: string; description: string; status: 'ACTIVE' | 'PAUSED'; imageCount?: number; frequencyMinutes: number; activeDays: number[]; startTime: string; endTime: string; timezone: string; generalKeywords: string[]; productIds: string[]; products: Array<Pick<Product, 'id' | 'name' | 'productImage'>>; sources: AgentNewsSource[]; lastAttemptAt: string | null; lastSuccessAt: string | null; lastExecutionStatus: string | null; nextRunAt: string | null; createdAt: string; updatedAt: string }
export interface AgentNewsExecution { id: string; agentId: string; agentName: string; triggerType: 'MANUAL' | 'SCHEDULED'; status: string; startedAt: string | null; completedAt: string | null; errorMessage: string | null; createdAt: string }
export interface AgentNewsSourceRun { id: string; executionId: string; platform: AgentNewsPlatform; actorId: string; apifyRunId: string | null; datasetId: string | null; status: string; startedAt: string | null; completedAt: string | null; resultsCount: number; newItemsCount: number; duplicateItemsCount: number; errorMessage: string | null; usageMetadata: Record<string, unknown> | null }
export interface AgentNewsContent { id: string; agentId: string; agentName: string; executionId: string; platform: AgentNewsPlatform; externalPostId: string; postUrl: string | null; author: string | null; text: string | null; thumbnailUrl: string | null; searchTerm: string | null; productIds: string[]; publishedAt: string | null; retrievedAt: string; engagement: Record<string, unknown>; recommendation: 'PENDING'|'RECOMMENDED'|'NOT_RECOMMENDED'|'FAILED'; relevanceScore: number|null; analysisReason: string|null; matchedProductIds: string[]; analyzedAt: string|null; analysisModel: string|null }
