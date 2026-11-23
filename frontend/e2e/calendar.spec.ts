import { expect, test } from '@playwright/test'

test('calendar displays a scheduled post in WIB and filters it by status', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-24T02:00:00Z'))
  await page.route('**/api/auth/me', route => route.fulfill({ json: {
    success: true, data: { user: { id: 'admin', role: 'ADMIN', name: 'Admin', isActive: true } },
  } }))
  await page.route('**/api/content/calendar?*', route => route.fulfill({ json: {
    success: true, data: { items: [{
      id: 'sample', title: 'Konten uji', caption: null, productId: 'product', productName: 'Produk uji',
      at: '2026-11-24T03:15:00Z', status: 'scheduled', platforms: ['INSTAGRAM'], confirmed: true, scheduled: true,
    }] },
  } }))
  await page.goto('/calendar')
  await expect(page.getByRole('heading', { name: 'Kalender Konten' })).toBeVisible()
  await page.getByRole('button', { name: 'Agenda', exact: true }).click()
  await expect(page.getByText('Konten uji', { exact: true })).toBeVisible()
  await expect(page.getByText(/10[.:]15/).first()).toBeVisible()
  await page.getByLabel('Status', { exact: true }).selectOption('published')
  await expect(page.getByText('Tidak ada konten yang cocok dengan filter.')).toBeVisible()
})
