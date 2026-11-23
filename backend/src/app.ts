import { randomBytes, timingSafeEqual } from 'node:crypto'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express, { type NextFunction, type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import { z } from 'zod'
import { hashPassword, verifyPassword } from './auth/password.js'
import { InstagramHashtagAdapter, ThreadsKeywordAdapter, TikTokHashtagAdapter } from './agent-news/adapters.js'
import { defaultConceptPrompt, defaultImagePrompt } from './content/default-prompts.js'
import { contentInput, type ContentGenerator } from './content/generator.js'
import { AgentNewsExecutor } from './agent-news/executor.js'
import { calculateNextRun } from './agent-news/schedule.js'
import {
  createSessionToken,
  csrfCookieName,
  hashSessionToken,
  sessionCookieName,
} from './auth/session.js'
import type { AppStore, ProductRecord, UpdateProductInput, UserModule, UserRecord } from './domain.js'
import { toPublicUser, userModules } from './domain.js'
import { ApiError, errorHandler } from './errors.js'
import {
  listTebarAccounts,
  testApifyConnection,
  testTebarConnection,
  type ApifyConnectionTest,
  type TebarConnectionTest,
} from './integrations/connection.js'
import {
  testLlmConnection,
  type LlmConnectionTest,
} from './llm/connection.js'
import { decryptSecret, encryptSecret } from './security/encrypted-secret.js'

export interface AppConfig {
  frontendUrl: string
  sessionTtlHours: number
  secureCookies: boolean
  rateLimitEnabled: boolean
  settingsEncryptionKey: string
}

interface AppDependencies {
  store: AppStore
  config: AppConfig
  checkDatabase?: () => Promise<void>
  contentGenerator?: ContentGenerator
  llmConnectionTest?: LlmConnectionTest
  tebarConnectionTest?: TebarConnectionTest
  apifyConnectionTest?: ApifyConnectionTest
  agentNewsExecutor?: Pick<AgentNewsExecutor, 'enqueue'>
}

type AuthenticatedRequest = Request & { authUser?: UserRecord; sessionTokenHash?: string }

const passwordSchema = z
  .string()
  .min(12, 'Password minimal 12 karakter')
  .max(200)
  .regex(/[a-z]/, 'Password membutuhkan huruf kecil')
  .regex(/[A-Z]/, 'Password membutuhkan huruf besar')
  .regex(/[0-9]/, 'Password membutuhkan angka')

const loginSchema = z.object({
  email: z.string().email().max(255).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(200),
})

const userAccessSchema = z.object({
  modules: z.array(z.enum(userModules)).min(1).max(userModules.length).transform(values => [...new Set(values)]),
  accountIds: z.array(z.uuid()).max(1000).transform(values => [...new Set(values)]),
})

const createUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().email().max(255).transform((value) => value.toLowerCase()),
  phone: z.string().trim().max(30).nullable().optional(),
  password: passwordSchema,
  role: z.enum(['ADMIN', 'USER']),
  isActive: z.boolean().default(true),
  access: userAccessSchema.optional(),
})

const updateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    email: z.string().email().max(255).transform((value) => value.toLowerCase()).optional(),
    phone: z.string().trim().max(30).nullable().optional(),
    password: passwordSchema.optional(),
    role: z.enum(['ADMIN', 'USER']).optional(),
    isActive: z.boolean().optional(),
    access: userAccessSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Tidak ada perubahan')

const profileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).nullable().optional(),
})

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
})

const httpUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine((value) => {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
  }, 'Base URL harus menggunakan HTTP atau HTTPS tanpa kredensial')

const llmSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  baseUrl: httpUrlSchema,
  model: z.string().trim().min(1).max(200),
  apiKey: z.string().trim().min(1).max(4096).optional(),
})

const agentSettingsSchema = z.object({
  enabled: z.boolean(),
  intervalValue: z.number().int().min(1).max(1440),
  intervalUnit: z.enum(['minutes', 'hours', 'days']),
  activeDays: z
    .array(z.number().int().min(0).max(6))
    .min(1)
    .max(7)
    .transform((days) => [...new Set(days)].sort()),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
})

const tebarSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  baseUrl: httpUrlSchema,
  apiKey: z.string().trim().min(1).max(4096).optional(),
  profile: z.string().trim().max(255).nullable().optional(),
})

const apifySettingsSchema = z.object({
  enabled: z.boolean().default(true),
  baseUrl: httpUrlSchema,
  apiToken: z.string().trim().min(1).max(4096).optional(),
})

const settingsSchema = z.object({
  appName: z.string().trim().min(2).max(80),
  timezone: z.string().trim().min(1).max(80),
  defaultLanguage: z.string().trim().min(2).max(10),
  contentPrompts: z.object({
    concept: z.string().trim().min(1).max(10000),
    image: z.string().trim().min(1).max(10000),
  }).optional(),
  llm: llmSettingsSchema.optional(),
  agent: agentSettingsSchema.optional(),
  tebar: tebarSettingsSchema.optional(),
  apify: apifySettingsSchema.optional(),
})

const llmTestSchema = llmSettingsSchema.partial()
const tebarTestSchema = tebarSettingsSchema.partial()
const apifyTestSchema = apifySettingsSchema.partial()

const imageDataUrlSchema = z
  .string()
  .max(7_000_000, 'Ukuran gambar maksimal 5MB')
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/, 'Format gambar harus PNG, JPG, atau WebP')

const productSchema = z.object({
  name: z.string().trim().min(1).max(160),
  productImage: imageDataUrlSchema,
  productImageName: z.string().trim().min(1).max(255).default('product.png'),
  baseImage: imageDataUrlSchema,
  baseImageName: z.string().trim().min(1).max(255).default('base-image.png'),
  description: z.string().trim().min(1).max(2000),
  productType: z.string().trim().min(1).max(500),
  branding: z.string().trim().min(1).max(500),
  linkedAccounts: z.array(z.string().trim().min(1).max(120)).max(20).transform((accounts) => [...new Set(accounts)]),
})

const updateProductSchema = productSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'Tidak ada perubahan',
)

const sourceSchema = z.discriminatedUnion('platform', [
  z.object({ platform: z.literal('INSTAGRAM'), actorId: z.literal('apify/instagram-hashtag-scraper'), isEnabled: z.boolean(), config: InstagramHashtagAdapter.schema.extend({ hashtags: z.array(z.string().trim().min(1).max(200)).max(50) }) }),
  z.object({ platform: z.literal('TIKTOK'), actorId: z.literal('clockworks/tiktok-hashtag-scraper'), isEnabled: z.boolean(), config: TikTokHashtagAdapter.schema.extend({ hashtags: z.array(z.string().trim().min(1).max(200)).max(50) }) }),
  z.object({ platform: z.literal('THREADS'), actorId: z.literal('watcher.data/search-threads-by-keywords'), isEnabled: z.boolean(), config: ThreadsKeywordAdapter.schema.extend({ keywords: z.array(z.string().trim().min(1).max(200)).max(50) }) }),
])

const agentNewsSchema = z.object({
  imageCount: z.number().int().min(1).max(5).optional(),
  name: z.string().trim().min(2).max(160), description: z.string().trim().min(5).max(2000), status: z.enum(['ACTIVE', 'PAUSED']), frequencyMinutes: z.union([z.literal(15), z.literal(30), z.literal(60), z.literal(180), z.literal(360), z.literal(720), z.literal(1440)]), activeDays: z.array(z.number().int().min(0).max(6)).min(1).max(7).transform((days) => [...new Set(days)]), startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), timezone: z.string().trim().min(1).max(80), generalKeywords: z.array(z.string().trim().min(1).max(200)).max(50).transform((values) => [...new Set(values)]), productIds: z.array(z.string().uuid()).min(1).max(50).transform((values) => [...new Set(values)]), sources: z.array(sourceSchema).length(3),
}).superRefine((value, context) => { const enabled = value.sources.filter((source) => source.isEnabled); if (!enabled.length) context.addIssue({ code: 'custom', path: ['sources'], message: 'Minimal satu sumber Apify harus aktif' }); for (const source of enabled) { const terms = source.platform === 'THREADS' ? source.config.keywords : source.config.hashtags; if (!terms.length) context.addIssue({ code: 'custom', path: ['sources', source.platform], message: 'Sumber aktif wajib memiliki minimal satu keyword atau hashtag' }); if (new Set(terms.map((term) => term.toLowerCase())).size !== terms.length) context.addIssue({ code: 'custom', path: ['sources', source.platform], message: 'Keyword atau hashtag duplikat tidak diperbolehkan' }) } })

function safeEqual(left?: string, right?: string) {
  if (!left || !right) return false
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function toPublicSettings(settings: Awaited<ReturnType<AppStore['getSettings']>>) {
  return {
    appName: settings.appName,
    timezone: settings.timezone,
    defaultLanguage: settings.defaultLanguage,
    contentPrompts: {
      concept: settings.contentConceptPrompt ?? defaultConceptPrompt,
      image: settings.contentImagePrompt ?? defaultImagePrompt,
      defaults: { concept: defaultConceptPrompt, image: defaultImagePrompt },
    },
    llm: {
      enabled: settings.llmEnabled,
      baseUrl: settings.llmBaseUrl,
      model: settings.llmModel,
      apiKeyConfigured: Boolean(settings.llmApiKeyEncrypted),
    },
    agent: {
      enabled: settings.agentEnabled,
      intervalValue: settings.agentIntervalValue,
      intervalUnit: settings.agentIntervalUnit,
      activeDays: settings.agentActiveDays,
      startTime: settings.agentStartTime,
      endTime: settings.agentEndTime,
    },
    tebar: {
      enabled: settings.tebarEnabled,
      baseUrl: settings.tebarBaseUrl,
      profile: settings.tebarProfile,
      apiKeyConfigured: Boolean(settings.tebarApiKeyEncrypted),
    },
    apify: {
      enabled: settings.apifyEnabled,
      baseUrl: settings.apifyBaseUrl,
      apiTokenConfigured: Boolean(settings.apifyApiTokenEncrypted),
    },
  }
}

export function createApp({
  store,
  config,
  llmConnectionTest = testLlmConnection,
  tebarConnectionTest = testTebarConnection,
  apifyConnectionTest = testApifyConnection,
  agentNewsExecutor,
  contentGenerator,
  checkDatabase,
}: AppDependencies) {
  const app = express()
  const cookieOptions = {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: 'strict' as const,
    path: '/',
  }
  const newsExecutor = agentNewsExecutor ?? new AgentNewsExecutor(store, config.settingsEncryptionKey)

  app.disable('x-powered-by')
  app.use(helmet())
  app.use(cors({ origin: config.frontendUrl, credentials: true }))
  app.use(express.json({ limit: '14mb' }))
  app.use(cookieParser())

  const csrfRequired = (request: Request, _response: Response, next: NextFunction) => {
    if (!safeEqual(request.cookies[csrfCookieName], request.header('x-csrf-token'))) {
      next(new ApiError(403, 'CSRF token tidak valid'))
      return
    }
    next()
  }

  const authRequired = async (
    request: AuthenticatedRequest,
    _response: Response,
    next: NextFunction,
  ) => {
    try {
      const token = request.cookies[sessionCookieName]
      if (!token) throw new ApiError(401, 'Silakan login')

      const tokenHash = hashSessionToken(token)
      const session = await store.findSession(tokenHash)
      if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
        if (session) await store.deleteSession(tokenHash)
        throw new ApiError(401, 'Sesi telah berakhir')
      }

      const user = await store.findUserById(session.userId)
      if (!user?.isActive) throw new ApiError(401, 'Akun tidak aktif')

      request.authUser = user
      request.sessionTokenHash = tokenHash
      next()
    } catch (error) {
      next(error)
    }
  }

  const adminRequired = (
    request: AuthenticatedRequest,
    _response: Response,
    next: NextFunction,
  ) => {
    if (request.authUser?.role !== 'ADMIN') {
      next(new ApiError(403, 'Akses admin diperlukan'))
      return
    }
    next()
  }

  const hasModule = (user: UserRecord, module: UserModule) =>
    user.role === 'ADMIN' || user.access?.modules.includes(module) === true

  const moduleRequired = (...modules: UserModule[]) =>
    (request: AuthenticatedRequest, _response: Response, next: NextFunction) => {
      const user = request.authUser!
      next(modules.some(module => hasModule(user, module)) ? undefined : new ApiError(403, 'Akses modul diperlukan'))
    }

  const canUseAccount = (user: UserRecord, id: string) =>
    user.role === 'ADMIN' || user.access?.accountIds.includes(id) === true

  const visibleProduct = (user: UserRecord, product: ProductRecord): ProductRecord => ({
    ...product,
    linkedAccounts: product.linkedAccounts.filter(id => canUseAccount(user, id)),
  })

  const checkAccountLinks = (user: UserRecord, ids: string[]) => {
    if (ids.some(id => !canUseAccount(user, id))) throw new ApiError(403, 'Akun tertaut di luar hak akses')
  }

  app.get('/api/health', async (_request, response) => {
    response.set('Cache-Control', 'no-store')
    try {
      await checkDatabase?.()
    } catch {
      response.status(503).json({ success: false, error: 'Database unavailable' })
      return
    }
    response.json({ success: true, data: { status: 'ok' } })
  })

  app.get('/api/auth/csrf', (_request, response) => {
    const token = randomBytes(24).toString('base64url')
    response.cookie(csrfCookieName, token, { ...cookieOptions, httpOnly: false })
    response.json({ success: true, data: { csrfToken: token } })
  })

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => !config.rateLimitEnabled,
  })

  const integrationTestLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => !config.rateLimitEnabled,
  })

  app.post('/api/auth/login', loginLimiter, csrfRequired, async (request, response) => {
    const input = loginSchema.parse(request.body)
    const user = await store.findUserByEmail(input.email)
    if (!user?.isActive || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new ApiError(401, 'Email atau password salah')
    }

    const { token, tokenHash } = createSessionToken()
    const expiresAt = new Date(Date.now() + config.sessionTtlHours * 60 * 60 * 1000)
    await store.createSession({ tokenHash, userId: user.id, expiresAt: expiresAt.toISOString() })
    response.cookie(sessionCookieName, token, {
      ...cookieOptions,
      expires: expiresAt,
    })
    response.json({ success: true, data: { user: toPublicUser(user) } })
  })

  app.get('/api/auth/me', authRequired, (request: AuthenticatedRequest, response) => {
    response.json({ success: true, data: { user: toPublicUser(request.authUser!) } })
  })

  app.post(
    '/api/auth/logout',
    csrfRequired,
    authRequired,
    async (request: AuthenticatedRequest, response) => {
      await store.deleteSession(request.sessionTokenHash!)
      response.clearCookie(sessionCookieName, cookieOptions)
      response.status(204).send()
    },
  )

  app.get('/api/users', authRequired, adminRequired, async (request, response) => {
    const search = z.string().max(100).catch('').parse(request.query.q)
    const users = await store.listUsers(search)
    response.json({ success: true, data: { users: users.map(toPublicUser) } })
  })

  app.post('/api/users', csrfRequired, authRequired, adminRequired, async (request, response) => {
    const input = createUserSchema.parse(request.body)
    if (await store.findUserByEmail(input.email)) throw new ApiError(409, 'Email sudah digunakan')
    if (input.role === 'USER' && !input.access) throw new ApiError(400, 'Pilih modul dan akses akun untuk User')
    const user = await store.createUser({
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
      passwordHash: await hashPassword(input.password),
      role: input.role,
      access: input.role === 'USER' ? input.access ?? null : null,
      isActive: input.isActive,
    })
    response.status(201).json({ success: true, data: { user: toPublicUser(user) } })
  })

  app.patch(
    '/api/users/:id',
    csrfRequired,
    authRequired,
    adminRequired,
    async (request: AuthenticatedRequest, response) => {
      const targetId = z.string().uuid().parse(request.params.id)
      const target = await store.findUserById(targetId)
      if (!target) throw new ApiError(404, 'User tidak ditemukan')
      const input = updateUserSchema.parse(request.body)

      if (
        request.authUser!.id === target.id &&
        ((input.role && input.role !== 'ADMIN') || input.isActive === false)
      ) {
        throw new ApiError(400, 'Admin tidak dapat menurunkan akses akun sendiri')
      }
      if (input.email && input.email !== target.email) {
        const existing = await store.findUserByEmail(input.email)
        if (existing) throw new ApiError(409, 'Email sudah digunakan')
      }

      const role = input.role ?? target.role
      if (role === 'USER' && !input.access && !target.access) {
        throw new ApiError(400, 'Pilih modul dan akses akun untuk User')
      }

      const { password } = input
      const user = await store.updateUser(target.id, {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(role === 'ADMIN' ? { access: null } : input.access ? { access: input.access } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(password ? { passwordHash: await hashPassword(password) } : {}),
      })
      if (input.isActive === false || password) await store.deleteSessionsForUser(target.id)
      response.json({ success: true, data: { user: toPublicUser(user!) } })
    },
  )

  app.delete(
    '/api/users/:id',
    csrfRequired,
    authRequired,
    adminRequired,
    async (request: AuthenticatedRequest, response) => {
      const targetId = z.string().uuid().parse(request.params.id)
      if (request.authUser!.id === targetId) {
        throw new ApiError(400, 'Admin tidak dapat menghapus akun sendiri')
      }
      const target = await store.findUserById(targetId)
      if (!target) throw new ApiError(404, 'User tidak ditemukan')
      await store.softDeleteUser(target.id)
      response.status(204).send()
    },
  )

  app.get('/api/profile', authRequired, (request: AuthenticatedRequest, response) => {
    response.json({ success: true, data: { user: toPublicUser(request.authUser!) } })
  })

  app.patch(
    '/api/profile',
    csrfRequired,
    authRequired,
    async (request: AuthenticatedRequest, response) => {
      const input = profileSchema.parse(request.body)
      const user = await store.updateUser(request.authUser!.id, {
        name: input.name,
        phone: input.phone ?? null,
      })
      response.json({ success: true, data: { user: toPublicUser(user!) } })
    },
  )

  app.put(
    '/api/profile/password',
    csrfRequired,
    authRequired,
    async (request: AuthenticatedRequest, response) => {
      const input = changePasswordSchema.parse(request.body)
      if (!(await verifyPassword(input.currentPassword, request.authUser!.passwordHash))) {
        throw new ApiError(400, 'Password saat ini salah')
      }
      await store.updateUser(request.authUser!.id, {
        passwordHash: await hashPassword(input.newPassword),
      })
      await store.deleteSessionsForUser(request.authUser!.id)
      response.clearCookie(sessionCookieName, cookieOptions)
      response.status(204).send()
    },
  )

  app.get('/api/settings', authRequired, moduleRequired('settings'), async (_request, response) => {
    response.json({
      success: true,
      data: { settings: toPublicSettings(await store.getSettings()) },
    })
  })

  app.put(
    '/api/settings',
    csrfRequired,
    authRequired,
    adminRequired,
    async (request, response) => {
      const input = settingsSchema.parse(request.body)
      const current = await store.getSettings()
      const settings = await store.updateSettings({
        appName: input.appName,
        timezone: input.timezone,
        defaultLanguage: input.defaultLanguage,
        contentConceptPrompt: input.contentPrompts ? (input.contentPrompts.concept === defaultConceptPrompt ? null : input.contentPrompts.concept) : current.contentConceptPrompt,
        contentImagePrompt: input.contentPrompts ? (input.contentPrompts.image === defaultImagePrompt ? null : input.contentPrompts.image) : current.contentImagePrompt,
        llmEnabled: input.llm?.enabled ?? current.llmEnabled,
        llmBaseUrl: input.llm?.baseUrl ?? current.llmBaseUrl,
        llmModel: input.llm?.model ?? current.llmModel,
        llmApiKeyEncrypted: input.llm?.apiKey
          ? encryptSecret(input.llm.apiKey, config.settingsEncryptionKey)
          : current.llmApiKeyEncrypted,
        agentEnabled: input.agent?.enabled ?? current.agentEnabled,
        agentIntervalValue: input.agent?.intervalValue ?? current.agentIntervalValue,
        agentIntervalUnit: input.agent?.intervalUnit ?? current.agentIntervalUnit,
        agentActiveDays: input.agent?.activeDays ?? current.agentActiveDays,
        agentStartTime: input.agent?.startTime ?? current.agentStartTime,
        agentEndTime: input.agent?.endTime ?? current.agentEndTime,
        tebarEnabled: input.tebar?.enabled ?? current.tebarEnabled,
        tebarBaseUrl: input.tebar?.baseUrl ?? current.tebarBaseUrl,
        tebarProfile: input.tebar?.profile === undefined
          ? current.tebarProfile
          : input.tebar.profile || null,
        tebarApiKeyEncrypted: input.tebar?.apiKey
          ? encryptSecret(input.tebar.apiKey, config.settingsEncryptionKey)
          : current.tebarApiKeyEncrypted,
        apifyEnabled: input.apify?.enabled ?? current.apifyEnabled,
        apifyBaseUrl: input.apify?.baseUrl ?? current.apifyBaseUrl,
        apifyApiTokenEncrypted: input.apify?.apiToken
          ? encryptSecret(input.apify.apiToken, config.settingsEncryptionKey)
          : current.apifyApiTokenEncrypted,
      })
      response.json({ success: true, data: { settings: toPublicSettings(settings) } })
    },
  )

  app.post(
    '/api/settings/llm/test',
    integrationTestLimiter,
    csrfRequired,
    authRequired,
    adminRequired,
    async (request, response) => {
      const input = llmTestSchema.parse(request.body)
      const settings = await store.getSettings()
      const baseUrl = input.baseUrl ?? settings.llmBaseUrl
      const model = input.model ?? settings.llmModel
      if (!baseUrl || !model) throw new ApiError(400, 'Konfigurasi LLM belum lengkap')

      const apiKey = input.apiKey
        ?? (settings.llmApiKeyEncrypted
          ? decryptSecret(settings.llmApiKeyEncrypted, config.settingsEncryptionKey)
          : null)

      try {
        const result = await llmConnectionTest({ baseUrl, apiKey, model })
        response.json({
          success: true,
          data: { connected: true, modelAvailable: result.modelAvailable },
        })
      } catch {
        throw new ApiError(502, 'Koneksi LLM gagal')
      }
    },
  )

  app.post(
    '/api/settings/tebar/test',
    integrationTestLimiter,
    csrfRequired,
    authRequired,
    adminRequired,
    async (request, response) => {
      const input = tebarTestSchema.parse(request.body)
      const settings = await store.getSettings()
      const baseUrl = input.baseUrl ?? settings.tebarBaseUrl
      const profile = input.profile === undefined ? settings.tebarProfile : input.profile || null
      const apiKey = input.apiKey
        ?? (settings.tebarApiKeyEncrypted
          ? decryptSecret(settings.tebarApiKeyEncrypted, config.settingsEncryptionKey)
          : null)
      if (!baseUrl || !apiKey) throw new ApiError(400, 'Konfigurasi Tebar belum lengkap')

      try {
        await tebarConnectionTest({ baseUrl, apiKey, profile })
        response.json({ success: true, data: { connected: true } })
      } catch {
        throw new ApiError(502, 'Koneksi Tebar gagal')
      }
    },
  )

  app.post(
    '/api/settings/apify/test',
    integrationTestLimiter,
    csrfRequired,
    authRequired,
    adminRequired,
    async (request, response) => {
      const input = apifyTestSchema.parse(request.body)
      const settings = await store.getSettings()
      const baseUrl = input.baseUrl ?? settings.apifyBaseUrl
      const apiToken = input.apiToken
        ?? (settings.apifyApiTokenEncrypted
          ? decryptSecret(settings.apifyApiTokenEncrypted, config.settingsEncryptionKey)
          : null)
      if (!baseUrl || !apiToken) throw new ApiError(400, 'Konfigurasi Apify belum lengkap')

      try {
        await apifyConnectionTest({ baseUrl, apiToken })
        response.json({ success: true, data: { connected: true } })
      } catch {
        throw new ApiError(502, 'Koneksi Apify gagal')
      }
    },
  )

  app.get('/api/accounts', authRequired, moduleRequired('accounts', 'products'), async (request: AuthenticatedRequest, response) => {
    const user = request.authUser!
    response.set('Cache-Control', 'no-store')
    if (user.role === 'USER' && !user.access?.accountIds.length) {
      response.json({ success: true, data: { accounts: [] } })
      return
    }
    const settings = await store.getSettings()
    if (!settings.tebarEnabled || !settings.tebarApiKeyEncrypted) {
      throw new ApiError(503, 'Aktifkan integrasi Tebar dan isi API key di Settings')
    }

    try {
      const accounts = await listTebarAccounts({
        baseUrl: settings.tebarBaseUrl,
        apiKey: decryptSecret(settings.tebarApiKeyEncrypted, config.settingsEncryptionKey),
        profile: settings.tebarProfile,
      })
      response.json({ success: true, data: { accounts: accounts.filter(account => canUseAccount(user, account.id)) } })
    } catch {
      throw new ApiError(502, 'Gagal memuat akun dari Tebar')
    }
  })

  app.get('/api/products', authRequired, moduleRequired('products'), async (request: AuthenticatedRequest, response) => {
    const search = z.string().trim().max(100).catch('').parse(request.query.q)
    response.json({ success: true, data: { products: (await store.listProducts(search)).map(product => visibleProduct(request.authUser!, product)) } })
  })

  app.get('/api/products/:id', authRequired, moduleRequired('products'), async (request: AuthenticatedRequest, response) => {
    const id = z.string().uuid().parse(request.params.id)
    const product = await store.findProductById(id)
    if (!product) throw new ApiError(404, 'Produk tidak ditemukan')
    response.json({ success: true, data: { product: visibleProduct(request.authUser!, product) } })
  })

  app.post('/api/products', csrfRequired, authRequired, moduleRequired('products'), async (request: AuthenticatedRequest, response) => {
    const input = productSchema.parse(request.body)
    checkAccountLinks(request.authUser!, input.linkedAccounts)
    const product = await store.createProduct(input)
    response.status(201).json({ success: true, data: { product: visibleProduct(request.authUser!, product) } })
  })

  app.patch('/api/products/:id', csrfRequired, authRequired, moduleRequired('products'), async (request: AuthenticatedRequest, response) => {
    const id = z.string().uuid().parse(request.params.id)
    const input = updateProductSchema.parse(request.body)
    const updates = Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    ) as UpdateProductInput
    const user = request.authUser!
    let expectedLinks: string[] | undefined
    if (updates.linkedAccounts && user.role === 'USER') {
      checkAccountLinks(user, updates.linkedAccounts)
      const current = await store.findProductById(id)
      if (!current) throw new ApiError(404, 'Produk tidak ditemukan')
      expectedLinks = current.linkedAccounts
      const submittedLinks = new Set(updates.linkedAccounts)
      const retainedLinks = expectedLinks.filter(account => !canUseAccount(user, account) || submittedLinks.has(account))
      updates.linkedAccounts = productSchema.shape.linkedAccounts.parse([...new Set([...retainedLinks, ...submittedLinks])])
    }
    const product = await store.updateProduct(id, updates, expectedLinks)
    if (!product && expectedLinks) throw new ApiError(409, 'Akun tertaut berubah. Muat ulang produk dan coba lagi.')
    if (!product) throw new ApiError(404, 'Produk tidak ditemukan')
    response.json({ success: true, data: { product: visibleProduct(request.authUser!, product) } })
  })

  app.delete('/api/products/:id', csrfRequired, authRequired, adminRequired, async (request, response) => {
    const id = z.string().uuid().parse(request.params.id)
    if (!(await store.deleteProduct(id))) throw new ApiError(404, 'Produk tidak ditemukan')
    response.status(204).send()
  })

  app.get('/api/agent-news', authRequired, moduleRequired('agent-news'), async (request, response) => {
    const search = z.string().trim().max(100).catch('').parse(request.query.q)
    const agents = await store.listAgentNews(search)
    const contents = await store.listAgentNewsContents()
    const today = new Date().toISOString().slice(0, 10)
    response.json({ success: true, data: { agents, summary: { totalAgents: agents.length, activeAgents: agents.filter((agent) => agent.status === 'ACTIVE').length, dataToday: contents.filter((item) => item.retrievedAt.slice(0, 10) === today).length, nextSchedule: agents.map((agent) => agent.nextRunAt).filter(Boolean).sort()[0] ?? null } } })
  })

  app.get('/api/agent-news/executions', authRequired, moduleRequired('agent-news'), async (request, response) => { const agentId = z.string().uuid().optional().parse(request.query.agentId); response.json({ success: true, data: { executions: await store.listAgentNewsExecutions(agentId), sourceRuns: await store.listAgentNewsSourceRuns() } }) })
  app.get('/api/agent-news/contents', authRequired, moduleRequired('agent-news'), async (request, response) => { const agentId=z.string().uuid().optional().parse(request.query.agentId);const contents=await store.listAgentNewsContents();response.json({ success: true, data: { contents: agentId?contents.filter(item=>item.agentId===agentId):contents } }) })
  app.get('/api/agent-news/:id', authRequired, moduleRequired('agent-news'), async (request, response) => { const id = z.string().uuid().parse(request.params.id); const agent = await store.findAgentNewsById(id); if (!agent) throw new ApiError(404, 'Agent News tidak ditemukan'); response.json({ success: true, data: { agent } }) })

  app.post('/api/agent-news', csrfRequired, authRequired, adminRequired, async (request: AuthenticatedRequest, response) => {
    const input = agentNewsSchema.parse(request.body)
    for (const productId of input.productIds) if (!(await store.findProductById(productId))) throw new ApiError(400, 'Produk yang dipilih tidak ditemukan')
    const nextRunAt = input.status === 'ACTIVE' ? calculateNextRun(input) : null
    const agent = await store.createAgentNews({ ...input, createdBy: request.authUser!.id, nextRunAt })
    response.status(201).json({ success: true, data: { agent } })
  })

  app.patch('/api/agent-news/:id', csrfRequired, authRequired, adminRequired, async (request, response) => {
    const id = z.string().uuid().parse(request.params.id); if (!(await store.findAgentNewsById(id))) throw new ApiError(404, 'Agent News tidak ditemukan')
    const input = agentNewsSchema.parse(request.body); for (const productId of input.productIds) if (!(await store.findProductById(productId))) throw new ApiError(400, 'Produk yang dipilih tidak ditemukan')
    const agent = await store.updateAgentNews(id, { ...input, nextRunAt: input.status === 'ACTIVE' ? calculateNextRun(input) : null })
    response.json({ success: true, data: { agent } })
  })

  app.patch('/api/agent-news/:id/status', csrfRequired, authRequired, adminRequired, async (request, response) => { const id = z.string().uuid().parse(request.params.id); const status = z.object({ status: z.enum(['ACTIVE', 'PAUSED']) }).parse(request.body).status; const current = await store.findAgentNewsById(id); if (!current) throw new ApiError(404, 'Agent News tidak ditemukan'); const agent = await store.updateAgentNews(id, { status, nextRunAt: status === 'ACTIVE' ? calculateNextRun(current) : null }); response.json({ success: true, data: { agent } }) })
  app.post('/api/agent-news/:id/run', integrationTestLimiter, csrfRequired, authRequired, adminRequired, async (request, response) => { const id = z.string().uuid().parse(request.params.id); const execution = await newsExecutor.enqueue(id, 'MANUAL'); response.status(202).json({ success: true, data: { execution } }) })
  app.delete('/api/agent-news/:id', csrfRequired, authRequired, adminRequired, async (request, response) => { const id = z.string().uuid().parse(request.params.id); if (!(await store.deleteAgentNews(id))) throw new ApiError(404, 'Agent News tidak ditemukan'); response.status(204).send() })

  if (contentGenerator) {
    app.post('/api/agent-news/:id/executions/:executionId/content', integrationTestLimiter, csrfRequired, authRequired, adminRequired, async (request, response) => {
      const { id, executionId } = z.object({ id: z.string().uuid(), executionId: z.string().uuid() }).parse(request.params)
      const agent = await store.findAgentNewsById(id)
      const execution = (await store.listAgentNewsExecutions(id)).find((item) => item.id === executionId)
      if (!agent || !execution) throw new ApiError(404, 'Riwayat pengambilan tidak ditemukan')
      if (!['SUCCESS', 'PARTIAL_SUCCESS'].includes(execution.status)) throw new ApiError(409, 'Pengambilan data belum berhasil')
      const ids = await contentGenerator.fromExecution(agent, executionId)
      if (!ids.length) throw new ApiError(409, 'Riwayat ini belum memiliki rekomendasi dengan produk yang cocok.')
      response.json({ success: true, data: { ids } })
    })
    app.get('/api/content', authRequired, moduleRequired('content'), async (_request, response) => {
      response.json({ success: true, data: { items: await contentGenerator.list() } })
    })
    app.get('/api/content/calendar', authRequired, moduleRequired('content'), async (request: AuthenticatedRequest, response) => {
      const { from, to } = z.object({
        from: z.iso.datetime({ offset: true }),
        to: z.iso.datetime({ offset: true }),
      }).refine(({ from, to }) => {
        const duration = Date.parse(to) - Date.parse(from)
        return duration > 0 && duration <= 42 * 86_400_000
      }, 'Rentang kalender harus maju dan maksimal 42 hari.').parse(request.query)
      const user = request.authUser!
      const accountIds = user.role === 'ADMIN' ? undefined : user.access?.accountIds ?? []
      response.set('Cache-Control', 'no-store')
      response.json({ success: true, data: { items: await contentGenerator.calendar(from, to, accountIds) } })
    })
    app.post('/api/content/:id/slides/:index/regenerate', integrationTestLimiter, csrfRequired, authRequired, adminRequired, async (request, response) => {
      const { id, index } = z.object({ id: z.uuid(), index: z.coerce.number().int().min(0).max(4) }).parse(request.params)
      const content = await contentGenerator.regenerateSlide(id, index)
      response.status(201).json({ success: true, data: { content } })
    })
    app.post('/api/content/generate', integrationTestLimiter, csrfRequired, authRequired, adminRequired, async (request, response) => {
      const content = await contentGenerator.manual(contentInput.parse(request.body))
      response.status(201).json({ success: true, data: { content } })
    })
    app.get('/api/content/:id/calendar-images', authRequired, moduleRequired('content'), async (request, response) => {
      const id = z.uuid().parse(request.params.id)
      response.set('Cache-Control', 'no-store')
      response.json({ success: true, data: { images: await contentGenerator.calendarImages(id) } })
    })
    app.get('/api/content/:id/comments', authRequired, moduleRequired('content'), async (request, response) => {
      const id = z.uuid().parse(request.params.id)
      const { cursor, count } = z.object({ cursor: z.string().min(1).max(1000).optional(), count: z.literal('1').optional() }).parse(request.query)
      response.json({ success: true, data: await contentGenerator.comments(id, cursor, count === '1') })
    })
    app.patch('/api/content/:id/status', csrfRequired, authRequired, adminRequired, async (request, response) => {
      const id = z.string().uuid().parse(request.params.id)
      const { status, scheduledAt } = z.object({
        status: z.enum(['DRAFT', 'REVIEW', 'APPROVED', 'REJECTED']),
        scheduledAt: z.iso.datetime({ offset: true }).optional(),
      }).parse(request.body)
      if (status === 'APPROVED') await contentGenerator.approve(id, scheduledAt)
      else await contentGenerator.transition(id, status)
      response.status(204).send()
    })
  }

  app.use((_request, _response, next) => next(new ApiError(404, 'Endpoint tidak ditemukan')))
  app.use(errorHandler)
  return app
}
