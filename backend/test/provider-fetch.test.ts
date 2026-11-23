import { expect, it, vi } from 'vitest'
import { providerFetch } from '../src/security/provider-fetch.js'

it('permits only configured HTTPS origins and rejects redirects in production', async () => {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('PROVIDER_ORIGINS', 'https://provider.example')
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'))
  try {
    await expect(providerFetch('http://provider.example/v1', {}, fetcher)).rejects.toThrow()
    await expect(providerFetch('https://wrong.example/v1', {}, fetcher)).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
    await providerFetch('https://provider.example/v1', { redirect: 'follow' }, fetcher)
    expect(fetcher).toHaveBeenCalledWith('https://provider.example/v1', { redirect: 'error' })
  } finally {
    vi.unstubAllEnvs()
  }
})
