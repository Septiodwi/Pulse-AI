export async function providerFetch(url: string, init: RequestInit, fetcher: typeof fetch = fetch) {
  const target = new URL(url)
  if (process.env.NODE_ENV === 'production') {
    const allowed = (process.env.PROVIDER_ORIGINS ?? '').split(',').map(value => value.trim())
    if (target.protocol !== 'https:' || target.username || target.password || !allowed.includes(target.origin)) {
      throw new Error('Provider origin is not allowed')
    }
  }
  return fetcher(url, { ...init, redirect: 'error' })
}
