import { beforeEach, describe, expect, it, vi } from 'vitest'

const user = {
  id: 'admin-id',
  name: 'Pulse Admin',
  email: 'admin@pulse.local',
  phone: null,
  role: 'ADMIN' as const,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('auth state', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('stores the authenticated user after login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        if (String(input).endsWith('/auth/csrf')) {
          return jsonResponse({ success: true, data: { csrfToken: 'test-token' } })
        }
        return jsonResponse({ success: true, data: { user } })
      }),
    )
    const { auth } = await import('./auth')

    await auth.login('admin@pulse.local', 'StrongPass123!')

    expect(auth.state.user).toEqual(user)
    expect(auth.state.ready).toBe(true)
    expect(auth.user.value).toEqual(user)
    expect(auth.isAdmin.value).toBe(true)
  })

  it('limits module access for guests and regular users', async () => {
    const { auth } = await import('./auth')
    expect(auth.canAccess('content')).toBe(false)
    auth.setUser({ ...user, role: 'USER' })
    expect(auth.canAccess('content')).toBe(false)
    auth.setUser({ ...user, role: 'USER', access: { modules: ['content'], accountIds: [] } })
    expect(auth.canAccess('content')).toBe(true)
    expect(auth.canAccess('settings')).toBe(false)
    auth.setUser(user)
    expect(auth.canAccess('settings')).toBe(true)
  })

  it('loads an existing session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ success: true, data: { user } })))
    const { auth } = await import('./auth')

    await auth.load()

    expect(auth.state.user).toEqual(user)
    expect(auth.state.ready).toBe(true)
  })

  it('turns an invalid session into a signed-out state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ error: { message: 'Silakan login' } }, 401)),
    )
    const { auth } = await import('./auth')

    await auth.load()

    expect(auth.state.user).toBeNull()
    expect(auth.state.ready).toBe(true)
  })

  it('clears the current user after logout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        if (String(input).endsWith('/auth/csrf')) {
          return jsonResponse({ success: true, data: { csrfToken: 'test-token' } })
        }
        return new Response(null, { status: 204 })
      }),
    )
    const { auth } = await import('./auth')
    auth.setUser(user)

    await auth.logout()

    expect(auth.state.user).toBeNull()
  })

  it('surfaces safe API error messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ error: { message: 'Akses ditolak' } }, 403)),
    )
    const { api, ApiError } = await import('./api')

    await expect(api('/settings')).rejects.toEqual(new ApiError('Akses ditolak', 403))
  })

  it('uses a generic message when an API error is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('upstream failed', { status: 502 })))
    const { api, ApiError } = await import('./api')

    await expect(api('/settings')).rejects.toEqual(new ApiError('Permintaan gagal', 502))
  })
})
