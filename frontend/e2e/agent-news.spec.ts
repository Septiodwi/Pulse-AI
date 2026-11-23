import { expect, test } from '@playwright/test'

test('admin creates an Instagram Agent News and can run Get Now', async ({ page }) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { success: true, data: { user: { id: 'admin-id', name: 'Admin Pulse', email: 'admin@pulse.local', role: 'ADMIN', isActive: true } } } }))
  await page.route('**/api/auth/csrf', (route) => route.fulfill({ json: { success: true, data: { csrfToken: 'test-token' } } }))
  await page.route('**/api/products', (route) => route.fulfill({ json: { success: true, data: { products: [{ id: '11111111-1111-4111-8111-111111111111', name: 'AceKid Plus 3', productImage: 'data:image/png;base64,AA==', productImageName: 'a.png', baseImage: 'data:image/png;base64,AA==', baseImageName: 'b.png', description: 'Produk', productType: 'Nutrisi', branding: 'AceKid', linkedAccounts: [], createdAt: '', updatedAt: '' }] } } }))
  await page.route('**/api/settings', (route) => route.fulfill({ json: { success: true, data: { settings: { appName: 'Pulse', timezone: 'Asia/Jakarta', defaultLanguage: 'id', agent: { enabled: true, intervalValue: 1, intervalUnit: 'hours', activeDays: [1], startTime: '08:00', endTime: '20:00' }, llm: { enabled: true, baseUrl: 'https://llm.local/v1', model: 'model', apiKeyConfigured: true }, tebar: { enabled: true, baseUrl: 'https://api.tebar.app', profile: null, apiKeyConfigured: true }, apify: { enabled: true, baseUrl: 'https://api.apify.com/v2', apiTokenConfigured: true } } } } }))
  let agents: unknown[] = []
  let executions: unknown[] = [], sourceRuns: unknown[] = [], contents: unknown[] = []
  await page.route('**/api/agent-news', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON()
      expect(body.sources.find((source: { platform: string }) => source.platform === 'INSTAGRAM').config).toEqual({ hashtags: ['AceKid'], contentType: 'posts', maxResultsPerHashtag: 50 })
      agents = [{ id: '22222222-2222-4222-8222-222222222222', ...body, products: [{ id: body.productIds[0], name: 'AceKid Plus 3', productImage: '' }], lastAttemptAt: null, lastSuccessAt: null, lastExecutionStatus: null, nextRunAt: new Date().toISOString(), createdAt: '', updatedAt: '' }]
      await route.fulfill({ status: 201, json: { success: true, data: { agent: agents[0] } } }); return
    }
    await route.fulfill({ json: { success: true, data: { agents, summary: { totalAgents: agents.length, activeAgents: agents.length, dataToday: 0, nextSchedule: null } } } })
  })
  await page.route('**/api/agent-news/executions**', (route) => route.fulfill({ json: { success: true, data: { executions, sourceRuns } } }))
  await page.route('**/api/agent-news/contents**', (route) => route.fulfill({ json: { success: true, data: { contents } } }))
  await page.route('**/api/agent-news/*/run', async (route) => { const agent=agents[0] as any;executions=[{id:'33333333-3333-4333-8333-333333333333',agentId:agent.id,agentName:agent.name,triggerType:'MANUAL',status:'SUCCESS',startedAt:new Date().toISOString(),completedAt:new Date().toISOString(),errorMessage:null,createdAt:new Date().toISOString()}];sourceRuns=[{id:'44444444-4444-4444-8444-444444444444',executionId:(executions[0] as any).id,platform:'INSTAGRAM',actorId:'apify/instagram-hashtag-scraper',apifyRunId:'RUN-ID-TERBARU',datasetId:'DATASET-TERBARU',status:'SUCCESS',startedAt:new Date().toISOString(),completedAt:new Date().toISOString(),resultsCount:1,newItemsCount:1,duplicateItemsCount:0,errorMessage:null,usageMetadata:null}];contents=[{id:'55555555-5555-4555-8555-555555555555',agentId:agent.id,agentName:agent.name,executionId:(executions[0] as any).id,platform:'INSTAGRAM',externalPostId:'post',postUrl:'https://example.com',author:'Author',text:'Konten relevan',thumbnailUrl:null,searchTerm:'AceKid',productIds:agent.productIds,publishedAt:new Date().toISOString(),retrievedAt:new Date().toISOString(),engagement:{},recommendation:'RECOMMENDED',relevanceScore:90,analysisReason:'Sesuai produk dan tujuan monitoring.',matchedProductIds:agent.productIds,analyzedAt:new Date().toISOString(),analysisModel:'model'}];await route.fulfill({ status: 202, json: { success: true, data: { execution: executions[0] } } }) })
  await page.route('**/api/agent-news/*/status', async (route) => {
    const body = route.request().postDataJSON(); agents = agents.map((item: any) => ({ ...item, status: body.status }))
    await route.fulfill({ json: { success: true, data: { agent: agents[0] } } })
  })
  await page.route(/\/api\/agent-news\/[0-9a-f-]+$/, async (route) => {
    if (route.request().method() === 'GET') { await route.fulfill({ json: { success: true, data: { agent: agents[0] } } }); return }
    if (route.request().method() === 'PATCH') { const body = route.request().postDataJSON(); agents = agents.map((item: any) => ({ ...item, ...body })); await route.fulfill({ json: { success: true, data: { agent: agents[0] } } }); return }
    if (route.request().method() === 'DELETE') { agents = []; await route.fulfill({ status: 204, body: '' }); return }
    await route.fallback()
  })

  await page.goto('/agent-news')
  await expect(page.getByRole('heading', { name: 'Agent News Setting' })).toBeVisible()
  await page.getByRole('button', { name: 'Buat Agent Baru' }).click()
  await page.getByLabel('Nama Agent').fill('AceKid Trend Monitor')
  await page.getByLabel('Tujuan Monitoring').fill('Memantau tren nutrisi anak')
  await page.getByRole('button', { name: 'Lanjut' }).click()
  await page.getByRole('button', { name: 'Pilih produk' }).click()
  await page.getByRole('checkbox', { name: 'AceKid Plus 3' }).check()
  await page.getByRole('button', { name: 'Lanjut' }).click()
  await page.getByLabel('Aktifkan Instagram').check()
  await page.getByRole('textbox', { name: 'Hashtag Instagram' }).fill('AceKid')
  await page.getByRole('button', { name: 'Tambah hashtag Instagram' }).click()
  await page.getByRole('button', { name: 'Lanjut' }).click()
  await page.getByRole('button', { name: '＋ Buat Agent', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Agent News berhasil dibuat')
  await page.getByRole('button', { name: 'Get Now AceKid Trend Monitor' }).click()
  await expect(page).toHaveURL(/agent-news\/.*tab=history/)
  await expect(page.getByText('RUN-ID-TERBARU')).toBeVisible()
  await page.getByRole('button', { name: 'Data Monitoring' }).click()
  await expect(page.getByText('REKOMENDASI', { exact: true })).toBeVisible()
  await expect(page.getByText('Konten relevan')).toBeVisible()
  await page.getByRole('button', { name: 'Kembali ke Daftar Agent' }).click()

  await page.getByRole('button', { name: 'Edit agent' }).click()
  await page.getByLabel('Nama Agent').fill('AceKid Monitor Diperbarui')
  await page.getByRole('button', { name: 'Lanjut' }).click()
  await page.getByRole('button', { name: 'Lanjut' }).click()
  await page.getByRole('button', { name: 'Lanjut' }).click()
  await page.getByRole('button', { name: '＋ Simpan Perubahan', exact: true }).click()
  await expect(page.getByText('AceKid Monitor Diperbarui')).toBeVisible()

  await page.getByRole('button', { name: 'Aktifkan atau nonaktifkan' }).click()
  await expect(page.getByRole('table').getByText('Nonaktif')).toBeVisible()
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Hapus agent' }).click()
  await expect(page.getByText('Belum ada Agent News.')).toBeVisible()
})
