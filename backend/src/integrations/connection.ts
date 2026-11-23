import { providerFetch } from '../security/provider-fetch.js'
import { ApiError } from '../errors.js'
import { z } from 'zod'

export interface TebarConnectionInput {
  baseUrl: string
  apiKey: string
  profile: string | null
}

interface ApifyConnectionInput {
  baseUrl: string
  apiToken: string
}

export type TebarConnectionTest = (input: TebarConnectionInput) => Promise<void>
export type ApifyConnectionTest = (input: ApifyConnectionInput) => Promise<void>

async function request(url: string, headers: Record<string, string>) {
  const response = await providerFetch(url, {
    headers,
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`Integration returned HTTP ${response.status}`)
  return response
}

function requestTebar({ baseUrl, apiKey, profile }: TebarConnectionInput, path: string) {
  return request(`${baseUrl.replace(/\/+$/, '')}${path}`, {
    authorization: `Bearer ${apiKey}`,
    ...(profile ? { 'tebar-profile': profile } : {}),
  })
}

export const testTebarConnection: TebarConnectionTest = async (input) => {
  await requestTebar(input, '/me')
}

const accountListSchema = z.object({ data: z.array(z.object({
  id: z.uuid(),
  platform: z.string().min(1),
  username: z.string().nullable(),
  display_name: z.string().nullable(),
  connected_at: z.iso.datetime({ offset: true }),
  status: z.enum(['active', 'expired', 'revoked']),
})) })

export async function listTebarAccounts(input: TebarConnectionInput) {
  const response = await requestTebar(input, '/accounts')
  return accountListSchema.parse(await response.json()).data
}

export const testApifyConnection: ApifyConnectionTest = async ({ baseUrl, apiToken }) => {
  await request(`${baseUrl.replace(/\/+$/, '')}/users/me`, {
    authorization: `Bearer ${apiToken}`,
  })
}


export async function tebarJson({ baseUrl, apiKey, profile }: TebarConnectionInput, path: string, init: RequestInit = {}) {
  try {
    const response = await providerFetch(`${baseUrl.replace(/\/+$/, '')}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${apiKey}`, ...(profile ? { 'tebar-profile': profile } : {}), ...init.headers },
      redirect: 'error',
      signal: init.signal ?? AbortSignal.timeout(25_000),
    })
    if (!response.ok) throw new ApiError(502, `Tebar menolak permintaan (HTTP ${response.status}).`)
    return await response.json() as unknown
  } catch (cause) {
    if (cause instanceof ApiError) throw cause
    throw new ApiError(502, 'Respons Tebar tidak tersedia. Coba lagi.')
  }
}
