import { providerFetch } from '../security/provider-fetch.js'
import { z } from 'zod'

const catalog = z.array(z.object({
    name: z.string(),
    aliases: z.array(z.string()).optional(),
    supported_endpoints: z.array(z.string()).optional(),
    input_modalities: z.array(z.string()).optional(),
    output_modalities: z.array(z.string()).optional(),
    max_reference_images: z.number().optional(),
  }))
async function loadCatalog(origin: string, kind: string) {
    const response = await providerFetch(`${origin}/${kind}/models`, { redirect: 'error', signal: AbortSignal.timeout(10_000) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return catalog.parse(await response.json())
  }
function matches(model: string, item: z.infer<typeof catalog>[number]) {
  return item.name === model || item.aliases?.includes(model)
}

export async function resolveTextModel(baseUrl: string, model: string) {
  const { origin } = new URL(baseUrl)
  if (origin !== 'https://gen.pollinations.ai') return model
  const available = (await loadCatalog(origin, 'text')).filter((item) =>
    item.output_modalities?.includes('text') && item.supported_endpoints?.includes('/v1/chat/completions'),
  )
  // ponytail: provider defaults until Settings exposes separate model selectors.
  const selected = available.find((item) => matches(model, item)) ?? available.find((item) => item.name === 'openai/gpt-5.4-nano')
  if (!selected) throw new Error('Model teks tidak tersedia')
  return selected.name
}

export async function resolveImageModel(baseUrl: string, model: string, references = 2) {
  const { origin } = new URL(baseUrl)
  if (origin !== 'https://gen.pollinations.ai') return model
  const available = (await loadCatalog(origin, 'image')).filter((item) =>
    item.supported_endpoints?.includes('/v1/images/edits') && item.input_modalities?.includes('image') &&
    (item.max_reference_images ?? 0) >= references,
  )
  const selected = available.find((item) => matches(model, item)) ?? available.find((item) => item.name === 'black-forest-labs/flux.2-klein-4b')
  if (!selected) throw new Error('Model gambar tidak tersedia')
  return selected.name
}
