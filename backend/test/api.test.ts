import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import { hashPassword } from '../src/auth/password.js'
import { createSessionToken, sessionCookieName } from '../src/auth/session.js'
import { MemoryStore } from '../src/store/memory-store.js'
import { parseLinkedAccounts } from '../src/store/product-json.js'

const adminEmail = 'admin@pulse.local'
const password = 'StrongPass123!'

interface SetupOverrides {
  checkDatabase?: () => Promise<void>
  llmConnectionTest?: ReturnType<typeof vi.fn>
  tebarConnectionTest?: ReturnType<typeof vi.fn>
  apifyConnectionTest?: ReturnType<typeof vi.fn>
  agentNewsExecutor?: { enqueue: ReturnType<typeof vi.fn> }
}

async function setup(overrides: SetupOverrides = {}) {
  const llmConnectionTest = overrides.llmConnectionTest
    ?? vi.fn(async () => ({ modelAvailable: true }))
  const tebarConnectionTest = overrides.tebarConnectionTest ?? vi.fn(async () => undefined)
  const apifyConnectionTest = overrides.apifyConnectionTest ?? vi.fn(async () => undefined)
  const store = new MemoryStore()
  await store.createUser({
    name: 'Pulse Admin',
    email: adminEmail,
    passwordHash: await hashPassword(password),
    role: 'ADMIN',
    isActive: true,
  })
  await store.createUser({
    name: 'Pulse User',
    email: 'user@pulse.local',
    passwordHash: await hashPassword(password),
    role: 'USER',
    isActive: true,
    access: { modules: ['settings'], accountIds: [] },
  })

  const app = createApp({
    store,
    ...(overrides.checkDatabase ? { checkDatabase: overrides.checkDatabase } : {}),
    llmConnectionTest,
    tebarConnectionTest,
    apifyConnectionTest,
    agentNewsExecutor: overrides.agentNewsExecutor,
    config: {
      frontendUrl: 'http://localhost:5173',
      sessionTtlHours: 168,
      secureCookies: false,
      rateLimitEnabled: false,
      settingsEncryptionKey: Buffer.alloc(32, 1).toString('base64'),
    },
  })

  return { app, store, llmConnectionTest, tebarConnectionTest, apifyConnectionTest }
}

async function csrf(agent: ReturnType<typeof request.agent>) {
  const response = await agent.get('/api/auth/csrf').expect(200)
  return response.body.data.csrfToken as string
}

async function login(
  app: ReturnType<typeof createApp>,
  email = adminEmail,
  loginPassword = password,
) {
  const agent = request.agent(app)
  const csrfToken = await csrf(agent)
  await agent
    .post('/api/auth/login')
    .set('x-csrf-token', csrfToken)
    .send({ email, password: loginPassword })
    .expect(200)
  return { agent, csrfToken }
}

describe('Pulse API', () => {
  let app: ReturnType<typeof createApp>
  let store: MemoryStore

  beforeEach(async () => {
    ;({ app, store } = await setup())
  })

  it('reports API health', async () => {
    const response = await request(app).get('/api/health').expect(200)
    expect(response.body.data.status).toBe('ok')
  })

  it('returns 503 without exposing database errors', async () => {
    const { app } = await setup({ checkDatabase: async () => { throw new Error('private DB address') } })
    const response = await request(app).get('/api/health').expect(503)
    expect(response.text).not.toContain('private DB address')
  })

  it('accepts MySQL JSON columns returned as strings or arrays', () => {
    expect(parseLinkedAccounts('["Instagram", "TikTok"]')).toEqual(['Instagram', 'TikTok'])
    expect(parseLinkedAccounts(['Instagram', 'TikTok'])).toEqual(['Instagram', 'TikTok'])
  })

  it('logs in, returns the current user, and logs out', async () => {
    const { agent, csrfToken } = await login(app)

    const me = await agent.get('/api/auth/me').expect(200)
    expect(me.body.data.user.email).toBe(adminEmail)
    expect(me.body.data.user).not.toHaveProperty('passwordHash')

    await agent.post('/api/auth/logout').set('x-csrf-token', csrfToken).expect(204)
    await agent.get('/api/auth/me').expect(401)
  })

  it('rejects invalid credentials without revealing the account state', async () => {
    const agent = request.agent(app)
    const csrfToken = await csrf(agent)
    const response = await agent
      .post('/api/auth/login')
      .set('x-csrf-token', csrfToken)
      .send({ email: adminEmail, password: 'wrong-password' })
      .expect(401)

    expect(response.body.error.message).toBe('Email atau password salah')
  })

  it('rejects inactive accounts with the same generic login error', async () => {
    const inactive = await store.findUserByEmail('user@pulse.local')
    await store.updateUser(inactive!.id, { isActive: false })
    const agent = request.agent(app)
    const csrfToken = await csrf(agent)
    const response = await agent
      .post('/api/auth/login')
      .set('x-csrf-token', csrfToken)
      .send({ email: 'user@pulse.local', password })
      .expect(401)

    expect(response.body.error.message).toBe('Email atau password salah')
  })

  it('rejects expired sessions', async () => {
    const user = await store.findUserByEmail(adminEmail)
    const { token, tokenHash } = createSessionToken()
    await store.createSession({
      tokenHash,
      userId: user!.id,
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    })

    await request(app)
      .get('/api/auth/me')
      .set('Cookie', `${sessionCookieName}=${token}`)
      .expect(401)
    expect(await store.findSession(tokenHash)).toBeNull()
  })

  it('rejects state-changing requests without CSRF protection', async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ email: adminEmail, password })
      .expect(403)
  })

  it('lets admins create, list, update, and deactivate users', async () => {
    const { agent, csrfToken } = await login(app)
    const created = await agent
      .post('/api/users')
      .set('x-csrf-token', csrfToken)
      .send({
        name: 'Editor Baru',
        email: 'editor@pulse.local',
        password,
        role: 'USER',
        isActive: true,
        access: { modules: ['products'], accountIds: [] },
      })
      .expect(201)

    const id = created.body.data.user.id as string
    expect(created.body.data.user).not.toHaveProperty('passwordHash')

    const listed = await agent.get('/api/users?q=editor').expect(200)
    expect(listed.body.data.users).toHaveLength(1)

    await agent
      .patch(`/api/users/${id}`)
      .set('x-csrf-token', csrfToken)
      .send({ name: 'Editor Utama', role: 'ADMIN' })
      .expect(200)

    await agent.delete(`/api/users/${id}`).set('x-csrf-token', csrfToken).expect(204)
    const afterDelete = await agent.get('/api/users?q=editor').expect(200)
    expect(afterDelete.body.data.users).toHaveLength(0)
  })

  it('prevents non-admin access to master user', async () => {
    const { agent, csrfToken } = await login(app, 'user@pulse.local')
    await agent.get('/api/users').expect(403)
    await agent
      .post('/api/users')
      .set('x-csrf-token', csrfToken)
      .send({ name: 'Nope', email: 'nope@pulse.local', password, role: 'USER' })
      .expect(403)
  })

  it('rejects duplicate user emails', async () => {
    const { agent, csrfToken } = await login(app)
    await agent
      .post('/api/users')
      .set('x-csrf-token', csrfToken)
      .send({ name: 'Duplicate', email: adminEmail, password, role: 'USER' })
      .expect(409)
  })

  it('validates user input and unknown resources', async () => {
    const { agent, csrfToken } = await login(app)
    const invalid = await agent
      .post('/api/users')
      .set('x-csrf-token', csrfToken)
      .send({ name: '', email: 'invalid', password: 'short', role: 'OWNER' })
      .expect(400)
    expect(invalid.body.error.message).toBe('Data tidak valid')

    await agent
      .patch('/api/users/not-a-uuid')
      .set('x-csrf-token', csrfToken)
      .send({ name: 'Valid Name' })
      .expect(400)
    await agent
      .patch('/api/users/00000000-0000-4000-8000-000000000000')
      .set('x-csrf-token', csrfToken)
      .send({ name: 'Valid Name' })
      .expect(404)
    await agent.get('/api/unknown').expect(404)
  })

  it('prevents admins from deleting or demoting their own account', async () => {
    const { agent, csrfToken } = await login(app)
    const me = await agent.get('/api/auth/me').expect(200)
    const id = me.body.data.user.id as string

    await agent
      .patch(`/api/users/${id}`)
      .set('x-csrf-token', csrfToken)
      .send({ role: 'USER' })
      .expect(400)
    await agent.delete(`/api/users/${id}`).set('x-csrf-token', csrfToken).expect(400)
  })

  it('rejects an email already owned by another user during update', async () => {
    const { agent, csrfToken } = await login(app)
    const users = await agent.get('/api/users?q=user@').expect(200)
    const id = users.body.data.users[0].id as string

    await agent
      .patch(`/api/users/${id}`)
      .set('x-csrf-token', csrfToken)
      .send({ email: adminEmail })
      .expect(409)
  })

  it('revokes sessions when an admin deactivates a user', async () => {
    const admin = await login(app)
    const userLogin = await login(app, 'user@pulse.local')
    const users = await admin.agent.get('/api/users?q=user@').expect(200)
    const id = users.body.data.users[0].id as string

    await admin.agent
      .patch(`/api/users/${id}`)
      .set('x-csrf-token', admin.csrfToken)
      .send({ isActive: false })
      .expect(200)
    await userLogin.agent.get('/api/auth/me').expect(401)
  })

  it('updates the signed-in user profile', async () => {
    const { agent, csrfToken } = await login(app, 'user@pulse.local')
    const response = await agent
      .patch('/api/profile')
      .set('x-csrf-token', csrfToken)
      .send({ name: 'Nama Baru', phone: '+628123456789' })
      .expect(200)

    expect(response.body.data.user.name).toBe('Nama Baru')
    expect(response.body.data.user.phone).toBe('+628123456789')
  })

  it('changes password only when the current password is correct', async () => {
    const { agent, csrfToken } = await login(app, 'user@pulse.local')
    await agent
      .put('/api/profile/password')
      .set('x-csrf-token', csrfToken)
      .send({ currentPassword: 'wrong-password', newPassword: 'NewStrongPass123!' })
      .expect(400)

    await agent
      .put('/api/profile/password')
      .set('x-csrf-token', csrfToken)
      .send({ currentPassword: password, newPassword: 'NewStrongPass123!' })
      .expect(204)

    await login(app, 'user@pulse.local', 'NewStrongPass123!')
  })

  it('allows admins to update settings and authenticated users to read them', async () => {
    const { agent, csrfToken } = await login(app)
    const updated = await agent
      .put('/api/settings')
      .set('x-csrf-token', csrfToken)
      .send({ appName: 'Pulse Studio', timezone: 'Asia/Jakarta', defaultLanguage: 'id' })
      .expect(200)

    expect(updated.body.data.settings.appName).toBe('Pulse Studio')

    const { agent: userAgent, csrfToken: userCsrf } = await login(app, 'user@pulse.local')
    await userAgent.get('/api/settings').expect(200)
    await userAgent
      .put('/api/settings')
      .set('x-csrf-token', userCsrf)
      .send({ appName: 'Hacked', timezone: 'UTC', defaultLanguage: 'en' })
      .expect(403)
  })

  it('stores LLM settings without exposing the API key and tests the saved connection', async () => {
    const connectionTest = vi.fn(async () => ({ modelAvailable: true }))
    const setupResult = await setup({ llmConnectionTest: connectionTest })
    const { agent, csrfToken } = await login(setupResult.app)

    const updated = await agent
      .put('/api/settings')
      .set('x-csrf-token', csrfToken)
      .send({
        appName: 'Pulse',
        timezone: 'Asia/Jakarta',
        defaultLanguage: 'id',
        llm: {
          baseUrl: 'https://llm.example/v1',
          apiKey: 'secret-test-key',
          model: 'gpt-test',
        },
      })
      .expect(200)

    expect(updated.body.data.settings.llm).toEqual({
      enabled: true,
      baseUrl: 'https://llm.example/v1',
      model: 'gpt-test',
      apiKeyConfigured: true,
    })
    expect(JSON.stringify(updated.body)).not.toContain('secret-test-key')

    const tested = await agent
      .post('/api/settings/llm/test')
      .set('x-csrf-token', csrfToken)
      .send({})
      .expect(200)

    expect(tested.body.data).toEqual({ connected: true, modelAvailable: true })
    expect(connectionTest).toHaveBeenCalledWith({
      baseUrl: 'https://llm.example/v1',
      apiKey: 'secret-test-key',
      model: 'gpt-test',
    })
  })

  it('rejects unsafe LLM URLs and non-admin connection tests', async () => {
    const { agent, csrfToken } = await login(app)
    await agent
      .put('/api/settings')
      .set('x-csrf-token', csrfToken)
      .send({
        appName: 'Pulse',
        timezone: 'Asia/Jakarta',
        defaultLanguage: 'id',
        llm: { baseUrl: 'file:///etc/passwd', apiKey: 'secret', model: 'gpt-test' },
      })
      .expect(400)

    const { agent: userAgent, csrfToken: userCsrf } = await login(app, 'user@pulse.local')
    await userAgent
      .post('/api/settings/llm/test')
      .set('x-csrf-token', userCsrf)
      .send({})
      .expect(403)
  })

  it('stores AI schedule, Tebar, and Apify settings and tests saved credentials', async () => {
    const tebarConnectionTest = vi.fn(async () => undefined)
    const apifyConnectionTest = vi.fn(async () => undefined)
    const setupResult = await setup({ tebarConnectionTest, apifyConnectionTest })
    const { agent, csrfToken } = await login(setupResult.app)

    const updated = await agent
      .put('/api/settings')
      .set('x-csrf-token', csrfToken)
      .send({
        appName: 'Pulse Content Platform',
        timezone: 'Asia/Jakarta',
        defaultLanguage: 'id',
        agent: {
          enabled: true,
          intervalValue: 6,
          intervalUnit: 'hours',
          activeDays: [1, 2, 3, 4, 5],
          startTime: '08:00',
          endTime: '22:00',
        },
        tebar: {
          enabled: true,
          baseUrl: 'https://api.tebar.app/v1',
          apiKey: 'tb_live_secret',
          profile: 'profile-id',
        },
        apify: {
          enabled: true,
          baseUrl: 'https://api.apify.com/v2',
          apiToken: 'apify_api_secret',
        },
      })
      .expect(200)

    expect(updated.body.data.settings.agent).toEqual({
      enabled: true,
      intervalValue: 6,
      intervalUnit: 'hours',
      activeDays: [1, 2, 3, 4, 5],
      startTime: '08:00',
      endTime: '22:00',
    })
    expect(updated.body.data.settings.tebar).toEqual({
      enabled: true,
      baseUrl: 'https://api.tebar.app/v1',
      profile: 'profile-id',
      apiKeyConfigured: true,
    })
    expect(updated.body.data.settings.apify).toEqual({
      enabled: true,
      baseUrl: 'https://api.apify.com/v2',
      apiTokenConfigured: true,
    })
    expect(JSON.stringify(updated.body)).not.toContain('tb_live_secret')
    expect(JSON.stringify(updated.body)).not.toContain('apify_api_secret')

    await agent
      .post('/api/settings/tebar/test')
      .set('x-csrf-token', csrfToken)
      .send({})
      .expect(200)
    expect(tebarConnectionTest).toHaveBeenCalledWith({
      baseUrl: 'https://api.tebar.app/v1',
      apiKey: 'tb_live_secret',
      profile: 'profile-id',
    })

    await agent
      .post('/api/settings/apify/test')
      .set('x-csrf-token', csrfToken)
      .send({})
      .expect(200)
    expect(apifyConnectionTest).toHaveBeenCalledWith({
      baseUrl: 'https://api.apify.com/v2',
      apiToken: 'apify_api_secret',
    })
  })

  it('returns a safe error when an integration connection test fails', async () => {
    const setupResult = await setup({
      tebarConnectionTest: vi.fn(async () => {
        throw new Error('upstream secret details')
      }),
    })
    const { agent, csrfToken } = await login(setupResult.app)
    const response = await agent
      .post('/api/settings/tebar/test')
      .set('x-csrf-token', csrfToken)
      .send({ baseUrl: 'https://api.tebar.app/v1', apiKey: 'invalid-key' })
      .expect(502)

    expect(response.body.error.message).toBe('Koneksi Tebar gagal')
    expect(JSON.stringify(response.body)).not.toContain('upstream secret details')
  })

  it('lets admins manage product profiles and search them', async () => {
    const { agent, csrfToken } = await login(app)
    const productImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'
    const created = await agent
      .post('/api/products')
      .set('x-csrf-token', csrfToken)
      .send({
        name: 'GlowSkin Serum',
        productImage,
        baseImage: productImage,
        description: 'A',
        productType: 'B',
        branding: 'C',
        linkedAccounts: ['Instagram Official', 'TikTok Shop'],
      })
      .expect(201)

    const id = created.body.data.product.id as string
    expect(created.body.data.product.name).toBe('GlowSkin Serum')

    const listed = await agent.get('/api/products?q=glowskin').expect(200)
    expect(listed.body.data.products).toHaveLength(1)
    expect(listed.body.data.products[0].linkedAccounts).toEqual([
      'Instagram Official',
      'TikTok Shop',
    ])

    await agent
      .patch(`/api/products/${id}`)
      .set('x-csrf-token', csrfToken)
      .send({ branding: 'Brand serum premium Indonesia.' })
      .expect(200)

    await agent.delete(`/api/products/${id}`).set('x-csrf-token', csrfToken).expect(204)
    await agent.get(`/api/products/${id}`).expect(404)
  })

  it('protects product mutations and validates uploaded images', async () => {
    const { agent: userAgent, csrfToken: userCsrf } = await login(app, 'user@pulse.local')
    await userAgent.get('/api/products').expect(403)
    await userAgent
      .post('/api/products')
      .set('x-csrf-token', userCsrf)
      .send({
        name: 'Produk Invalid',
        productImage: 'data:text/html;base64,PHNjcmlwdD4=',
        baseImage: 'data:image/png;base64,AA==',
        description: 'Deskripsi produk valid.',
        productType: 'Kategori produk',
        branding: 'Branding produk',
        linkedAccounts: [],
      })
      .expect(403)

    const { agent, csrfToken } = await login(app)
    const invalid = await agent
      .post('/api/products')
      .set('x-csrf-token', csrfToken)
      .send({
        name: 'Produk Invalid',
        productImage: 'data:text/html;base64,PHNjcmlwdD4=',
        baseImage: 'data:image/png;base64,AA==',
        description: 'Deskripsi produk valid.',
        productType: 'Kategori produk',
        branding: 'Branding produk',
        linkedAccounts: [],
      })
      .expect(400)
    expect(invalid.body.error.message).toBe('Data tidak valid')
  })

  it('creates, lists, pauses, runs, and deletes an Agent News configuration', async () => {
    const productImage = 'data:image/png;base64,AA=='
    const product = await store.createProduct({ name: 'AceKid', productImage, productImageName: 'product.png', baseImage: productImage, baseImageName: 'base.png', description: 'Produk nutrisi anak', productType: 'Nutrisi', branding: 'Tumbuh optimal', linkedAccounts: [] })
    const enqueue = vi.fn(async (agentId: string) => ({ id: 'execution-id', agentId, agentName: 'AceKid Monitor', triggerType: 'MANUAL', status: 'QUEUED', startedAt: null, completedAt: null, errorMessage: null, createdAt: new Date().toISOString() }))
    const setupResult = await setup({ agentNewsExecutor: { enqueue } })
    const setupProduct = await setupResult.store.createProduct({ name: 'AceKid', productImage, productImageName: 'product.png', baseImage: productImage, baseImageName: 'base.png', description: 'Produk nutrisi anak', productType: 'Nutrisi', branding: 'Tumbuh optimal', linkedAccounts: [] })
    const { agent, csrfToken } = await login(setupResult.app)
    const created = await agent.post('/api/agent-news').set('x-csrf-token', csrfToken).send({ name: 'AceKid Trend Monitor', description: 'Memantau tren nutrisi anak', status: 'ACTIVE', frequencyMinutes: 60, activeDays: [1,2,3,4,5], startTime: '08:00', endTime: '20:00', timezone: 'Asia/Jakarta', generalKeywords: ['Nutrisi Anak'], productIds: [setupProduct.id], sources: [
      { platform: 'INSTAGRAM', actorId: 'apify/instagram-hashtag-scraper', isEnabled: true, config: { hashtags: ['AceKid'], contentType: 'posts', maxResultsPerHashtag: 50 } },
      { platform: 'TIKTOK', actorId: 'clockworks/tiktok-hashtag-scraper', isEnabled: false, config: { hashtags: ['AceKid'], totalVideos: 100, downloadCovers: false, downloadSubtitles: false, downloadSlideshows: false } },
      { platform: 'THREADS', actorId: 'watcher.data/search-threads-by-keywords', isEnabled: false, config: { keywords: ['AceKid'], maxItemsPerKeyword: 50, sort: 'RECENT' } },
    ] }).expect(201)
    const id = created.body.data.agent.id as string
    expect(created.body.data.agent.products[0].name).toBe('AceKid')
    expect((await agent.get('/api/agent-news').expect(200)).body.data.summary.totalAgents).toBe(1)
    await agent.patch(`/api/agent-news/${id}/status`).set('x-csrf-token', csrfToken).send({ status: 'PAUSED' }).expect(200)
    await agent.post(`/api/agent-news/${id}/run`).set('x-csrf-token', csrfToken).expect(202)
    expect(enqueue).toHaveBeenCalledWith(id, 'MANUAL')
    await agent.delete(`/api/agent-news/${id}`).set('x-csrf-token', csrfToken).expect(204)
    expect(product.id).toBeTruthy()
  })

  it('rejects invalid Agent News source combinations', async () => {
    const setupResult = await setup()
    const image = 'data:image/png;base64,AA=='
    const product = await setupResult.store.createProduct({ name: 'Validator', productImage: image, productImageName: 'product.png', baseImage: image, baseImageName: 'base.png', description: 'Produk validasi', productType: 'Tes', branding: 'Tes', linkedAccounts: [] })
    const { agent, csrfToken } = await login(setupResult.app)
    const source = {
      instagram: { platform: 'INSTAGRAM', actorId: 'apify/instagram-hashtag-scraper', isEnabled: false, config: { hashtags: [], contentType: 'posts', maxResultsPerHashtag: 50 } },
      tiktok: { platform: 'TIKTOK', actorId: 'clockworks/tiktok-hashtag-scraper', isEnabled: false, config: { hashtags: [], totalVideos: 100, downloadCovers: false, downloadSubtitles: false, downloadSlideshows: false } },
      threads: { platform: 'THREADS', actorId: 'watcher.data/search-threads-by-keywords', isEnabled: false, config: { keywords: [], maxItemsPerKeyword: 50, sort: 'RECENT' } },
    }
    const payload = { name: 'Validasi Agent', description: 'Memastikan sumber tervalidasi', status: 'ACTIVE', frequencyMinutes: 60, activeDays: [1], startTime: '08:00', endTime: '20:00', timezone: 'Asia/Jakarta', generalKeywords: [], productIds: [product.id] }

    await agent.post('/api/agent-news').set('x-csrf-token', csrfToken).send({ ...payload, sources: Object.values(source) }).expect(400)
    await agent.post('/api/agent-news').set('x-csrf-token', csrfToken).send({ ...payload, sources: [{ ...source.instagram, isEnabled: true }, source.tiktok, source.threads] }).expect(400)
    await agent.post('/api/agent-news').set('x-csrf-token', csrfToken).send({ ...payload, sources: [source.instagram, source.tiktok, { ...source.threads, isEnabled: true }] }).expect(400)
    await agent.post('/api/agent-news').set('x-csrf-token', csrfToken).send({ ...payload, sources: [{ ...source.instagram, isEnabled: true, config: { ...source.instagram.config, hashtags: ['AceKid', 'acekid'] } }, source.tiktok, source.threads] }).expect(400)
    await agent.post('/api/agent-news').set('x-csrf-token', csrfToken).send({ ...payload, sources: [source.instagram, source.tiktok, { ...source.threads, isEnabled: true, config: { ...source.threads.config, keywords: ['AceKid', 'acekid'] } }] }).expect(400)
  })
})
