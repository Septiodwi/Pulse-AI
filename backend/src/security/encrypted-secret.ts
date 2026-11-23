import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

function decodeKey(encodedKey: string) {
  const key = Buffer.from(encodedKey, 'base64')
  if (key.length !== 32) throw new Error('SETTINGS_ENCRYPTION_KEY must decode to 32 bytes')
  return key
}

export function encryptSecret(value: string, encodedKey: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', decodeKey(encodedKey), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.')
}

export function decryptSecret(value: string, encodedKey: string) {
  const [version, iv, tag, encrypted] = value.split('.')
  if (version !== 'v1' || !iv || !tag || !encrypted) throw new Error('Invalid encrypted secret')

  const decipher = createDecipheriv('aes-256-gcm', decodeKey(encodedKey), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}
