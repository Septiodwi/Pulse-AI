import type { Pool } from 'mysql2/promise'
import { expect, it, vi } from 'vitest'
import { ContentGenerator } from '../src/content/generator.js'
import { encryptSecret } from '../src/security/encrypted-secret.js'
import { MemoryStore } from '../src/store/memory-store.js'

it('retries an ambiguous Tebar response with the same idempotency key and payload', async () => {
  const id = '11111111-1111-4111-8111-111111111111'
  const key = Buffer.alloc(32).toString('base64')
  const store = new MemoryStore()
  await store.updateSettings({
    ...await store.getSettings(), tebarEnabled: true, tebarBaseUrl: 'https://tebar.example',
    tebarApiKeyEncrypted: encryptSecret('test', key),
  })
  const row = {
    status: 'REVIEW', signal_key: null, payload: {
      caption: 'Scheduled post', history: [],
      publication: { mediaIds: [id], profile: id, accounts: [id], scheduledAt: null, postId: undefined },
    },
  }
  const connection = {
    release: vi.fn(),
    execute: vi.fn(async (sql: string, args?: string[]) => {
      if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]]
      if (sql.startsWith('SELECT status')) return [[row]]
      if (sql.startsWith('UPDATE')) {
        row.payload.publication = JSON.parse(args![0]!)
        row.status = 'APPROVED'
      }
      return [[]]
    }),
  }
  const fetcher = vi.fn<typeof fetch>()
    .mockRejectedValueOnce(new Error('Response lost'))
    .mockResolvedValueOnce(Response.json({ id, status: 'published' }))
  vi.stubGlobal('fetch', fetcher)
  try {
    const generator = new ContentGenerator({ getConnection: async () => connection } as unknown as Pool, store, key)
    await expect(generator.approve(id)).rejects.toMatchObject({ status: 502 })
    await generator.approve(id)
    await generator.approve(id)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ headers: { 'idempotency-key': `pulse-${id}` } })
    expect(fetcher.mock.calls[1]?.[1]?.body).toEqual(fetcher.mock.calls[0]?.[1]?.body)
    expect(fetcher.mock.calls[1]?.[1]?.headers).toEqual(fetcher.mock.calls[0]?.[1]?.headers)
    expect(row.status).toBe('APPROVED')
    expect(connection.release).toHaveBeenCalledTimes(3)
  } finally {
    vi.unstubAllGlobals()
  }
})
