import { providerFetch } from '../security/provider-fetch.js'
export interface LlmConnectionInput {
  baseUrl: string
  apiKey: string | null
  model: string
}

export interface LlmConnectionResult {
  modelAvailable: boolean
}

export type LlmConnectionTest = (
  input: LlmConnectionInput,
) => Promise<LlmConnectionResult>

export const testLlmConnection: LlmConnectionTest = async ({ baseUrl, apiKey, model }) => {
  const response = await providerFetch(`${baseUrl.replace(/\/+$/, '')}/models`, {
    ...(apiKey ? { headers: { authorization: `Bearer ${apiKey}` } } : {}),
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`LLM returned HTTP ${response.status}`)

  const body = (await response.json()) as { data?: Array<{ id?: string }> }
  return { modelAvailable: body.data?.some((item) => item.id === model) ?? false }
}
