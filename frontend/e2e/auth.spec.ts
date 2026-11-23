import { expect, test } from '@playwright/test'

test('login opens the protected dashboard', async ({ page }) => {
  await page.route('**/api/auth/csrf', async (route) => {
    await route.fulfill({ json: { success: true, data: { csrfToken: 'test-token' } } })
  })
  await page.route('**/api/auth/login', async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          user: {
            id: 'admin-id',
            name: 'Pulse Admin',
            email: 'admin@pulse.local',
            role: 'ADMIN',
            isActive: true,
          },
        },
      },
    })
  })
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          user: {
            id: 'admin-id',
            name: 'Pulse Admin',
            email: 'admin@pulse.local',
            role: 'ADMIN',
            isActive: true,
          },
        },
      },
    })
  })

  await page.goto('/login')
  await page.getByLabel('Email').fill('admin@pulse.local')
  await page.getByLabel('Password', { exact: true }).fill('StrongPass123!')
  await page.getByRole('button', { name: 'Masuk' }).click()

  await expect(page.getByRole('heading', { name: 'Selamat datang' })).toBeVisible()
})

test('admin can configure content prompts and test all integrations', async ({ page }) => {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          user: {
            id: 'admin-id',
            name: 'Pulse Admin',
            email: 'admin@pulse.local',
            role: 'ADMIN',
            isActive: true,
          },
        },
      },
    })
  })
  await page.route('**/api/auth/csrf', async (route) => {
    await route.fulfill({ json: { success: true, data: { csrfToken: 'test-token' } } })
  })
  const defaults = { concept: 'Prompt konsep bawaan', image: 'Prompt gambar {{ratio}}' }
  let prompts = { ...defaults }
  await page.route('**/api/settings', async (route) => {
    if (route.request().method() === 'PUT') prompts = route.request().postDataJSON().contentPrompts

    await route.fulfill({
      json: {
        success: true,
        data: {
          settings: {
            appName: 'Pulse',
            timezone: 'Asia/Jakarta',
            defaultLanguage: 'id',
            contentPrompts: { ...prompts, defaults },
            llm: {
              enabled: true,
              baseUrl: 'https://llm.example/v1',
              model: 'gpt-test',
              apiKeyConfigured: true,
            },
            tebar: {
              enabled: true,
              baseUrl: 'https://api.tebar.app/v1',
              profile: '',
              apiKeyConfigured: true,
            },
            apify: {
              enabled: true,
              baseUrl: 'https://api.apify.com/v2',
              apiTokenConfigured: true,
            },
          },
        },
      },
    })
  })
  await page.route('**/api/settings/llm/test', async (route) => {
    await route.fulfill({
      json: { success: true, data: { connected: true, modelAvailable: true } },
    })
  })
  await page.route('**/api/settings/tebar/test', async (route) => {
    await route.fulfill({ json: { success: true, data: { connected: true } } })
  })
  await page.route('**/api/settings/apify/test', async (route) => {
    await route.fulfill({ json: { success: true, data: { connected: true } } })
  })

  await page.goto('/settings')
  await expect(page.getByLabel('Prompt konsep dan caption')).toHaveValue(defaults.concept)
  await page.getByLabel('Prompt konsep dan caption').fill('Caption khusus')
  await page.getByRole('button', { name: 'Simpan Pengaturan' }).click()
  await expect(page.getByRole('status')).toContainText('berhasil disimpan')
  await page.reload()
  await expect(page.getByLabel('Prompt konsep dan caption')).toHaveValue('Caption khusus')
  await page.getByRole('button', { name: 'Kembalikan prompt bawaan' }).click()
  await expect(page.getByLabel('Prompt konsep dan caption')).toHaveValue(defaults.concept)
  await expect(page.getByLabel('LLM Base URL')).toHaveValue('https://llm.example/v1')
  await page.getByLabel('LLM API key').fill('new-secret-key')
  await expect(page.getByLabel('Model LLM')).toHaveValue('gpt-test')
  await page.getByRole('button', { name: 'Tes koneksi LLM' }).click()
  await expect(page.getByRole('status')).toContainText('Koneksi LLM berhasil')

  await expect(page.getByLabel('Tebar Base URL')).toHaveValue('https://api.tebar.app/v1')
  await page.getByRole('button', { name: 'Tes koneksi Tebar' }).click()
  await expect(page.getByRole('status')).toContainText('Koneksi Tebar berhasil')

  await expect(page.getByLabel('Apify Base URL')).toHaveValue('https://api.apify.com/v2')
  await page.getByRole('button', { name: 'Tes koneksi Apify' }).click()
  await expect(page.getByRole('status')).toContainText('Koneksi Apify berhasil')
})

test('failed connection test shows a red error popup', async ({ page }) => {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: { user: { id: 'admin-id', name: 'Admin Pulse', email: 'admin@pulse.local', role: 'ADMIN', isActive: true } },
      },
    })
  })
  await page.route('**/api/auth/csrf', async (route) => {
    await route.fulfill({ json: { success: true, data: { csrfToken: 'test-token' } } })
  })
  await page.route('**/api/settings', async (route) => {
    await route.fulfill({
      json: {
        success: true,
        data: {
          settings: {
            appName: 'Pulse', timezone: 'Asia/Jakarta', defaultLanguage: 'id',
            agent: { enabled: true, intervalValue: 6, intervalUnit: 'hours', activeDays: [1, 2, 3, 4, 5], startTime: '08:00', endTime: '22:00' },
            llm: { enabled: true, baseUrl: 'https://llm.example/v1', model: 'gpt-test', apiKeyConfigured: true },
            tebar: { enabled: true, baseUrl: 'https://api.tebar.app/v1', profile: '', apiKeyConfigured: true },
            apify: { enabled: true, baseUrl: 'https://api.apify.com/v2', apiTokenConfigured: true },
          },
        },
      },
    })
  })
  await page.route('**/api/settings/tebar/test', async (route) => {
    await route.fulfill({ status: 502, json: { success: false, error: { message: 'Koneksi Tebar gagal' } } })
  })

  await page.goto('/settings')
  await page.getByRole('button', { name: 'Tes koneksi Tebar' }).click()

  const popup = page.getByRole('alert')
  await expect(popup).toContainText('Koneksi Tebar gagal')
  await expect(popup).toHaveClass(/toast-error/)
})

test('admin can browse and create a product profile', async ({ page }) => {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({ json: { success: true, data: { user: { id: 'admin-id', name: 'Admin Pulse', email: 'admin@pulse.local', role: 'ADMIN', isActive: true } } } })
  })
  await page.route('**/api/auth/csrf', async (route) => {
    await route.fulfill({ json: { success: true, data: { csrfToken: 'test-token' } } })
  })
  await page.route('**/api/accounts', (route) => route.fulfill({ json: { success: true, data: { accounts: [
    { id: 'ig-1', platform: 'instagram', username: 'official', display_name: 'Instagram Official', connected_at: '2026-11-23T01:00:00Z', status: 'active' },
    { id: 'tt-1', platform: 'tiktok', username: 'shop', display_name: 'TikTok Shop', connected_at: '2026-11-23T01:00:00Z', status: 'active' },
    { id: 'yt-1', platform: 'youtube', username: null, display_name: 'YouTube Lama', connected_at: '2026-11-23T01:00:00Z', status: 'expired' },
  ] } } }))
  await page.goto('/accounts')
  await expect(page.getByRole('heading', { name: 'Social Media Account' })).toBeVisible()
  await expect(page.getByRole('row', { name: /YouTube Lama/ })).toContainText('Kedaluwarsa')
  await page.route('**/api/products', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON()
      expect(body.linkedAccounts).toEqual(['ig-1', 'tt-1'])
      await route.fulfill({ status: 201, json: { success: true, data: { product: { id: 'product-2', ...body, createdAt: '', updatedAt: '' } } } })
      return
    }
    await route.fulfill({ json: { success: true, data: { products: [{ id: 'product-1', name: 'GlowSkin Serum', productImage: 'data:image/png;base64,AA==', productImageName: 'serum.png', baseImage: 'data:image/png;base64,AA==', baseImageName: 'base.png', description: 'Serum wajah yang membantu mencerahkan kulit.', productType: 'Perawatan wajah', branding: 'Brand modern dan terpercaya.', linkedAccounts: ['Instagram Official'], createdAt: '', updatedAt: '' }] } } })
  })

  await page.goto('/products')
  await expect(page.getByRole('heading', { name: 'Brand Profile' })).toBeVisible()
  await expect(page.getByText('GlowSkin Serum')).toBeVisible()
  await page.getByRole('link', { name: 'Tambah Produk' }).click()

  await page.getByLabel('Nama Produk').fill('FreshMint Body Wash')
  const image = { name: 'product.png', mimeType: 'image/png', buffer: Buffer.from('image') }
  await page.getByLabel('Gambar Produk').setInputFiles(image)
  await page.getByLabel('Base Image Style').setInputFiles({ ...image, name: 'base.png' })
  await page.getByLabel('Deskripsi Produk').fill('Sabun mandi dengan aroma mint yang segar dan lembut.')
  await page.getByLabel('Jenis Produk').fill('Perawatan tubuh')
  await page.getByLabel('Branding Produk').fill('X')
  await page.getByRole('button', { name: 'Pilih linked akun' }).click()
  await page.getByRole('checkbox', { name: /Instagram Official/ }).check()
  await page.getByRole('checkbox', { name: /TikTok Shop/ }).check()
  await expect(page.getByRole('checkbox', { name: /YouTube Lama/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Pilih linked akun' })).toContainText('Instagram Official')
  await page.getByRole('heading', { name: 'Detail Produk' }).click()
  await expect(page.getByRole('button', { name: 'Pilih linked akun' })).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('listbox', { name: 'Daftar linked akun' })).toBeHidden()
  await page.getByRole('button', { name: 'Simpan Produk' }).click()
  await expect(page).toHaveURL(/\/products$/)
})
