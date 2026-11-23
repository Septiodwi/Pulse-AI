import type { ApiEnvelope } from '../types'

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'
let csrfToken: string | null = null

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message)
  }
}

async function ensureCsrf() {
  if (csrfToken) return csrfToken
  const response = await fetch(`${apiUrl}/api/auth/csrf`, { credentials: 'include' })
  if (!response.ok) throw new ApiError('Gagal menyiapkan keamanan form', response.status)
  const body = (await response.json()) as ApiEnvelope<{ csrfToken: string }>
  csrfToken = body.data.csrfToken
  return csrfToken
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = options.method?.toUpperCase() ?? 'GET'
  const headers = new Headers(options.headers)
  if (options.body) headers.set('content-type', 'application/json')
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    headers.set('x-csrf-token', await ensureCsrf())
  }

  const response = await fetch(`${apiUrl}/api${path}`, {
    ...options,
    headers,
    credentials: 'include',
  })
  if (response.status === 204) return undefined as T

  const body = await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(body?.error?.message ?? 'Permintaan gagal', response.status)
  return (body as ApiEnvelope<T>).data
}
