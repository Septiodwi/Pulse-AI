import { createHash, randomBytes } from 'node:crypto'

export const sessionCookieName = 'pulse_session'
export const csrfCookieName = 'pulse_csrf'

export function createSessionToken() {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashSessionToken(token) }
}

export function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}
