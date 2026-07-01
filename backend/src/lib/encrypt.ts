import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY
  if (!hex) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ENCRYPTION_KEY env var is required in production')
    }
    console.warn('[encrypt] ENCRYPTION_KEY not set — using insecure dev default')
    return Buffer.from('0'.repeat(64), 'hex')
  }
  if (hex.length !== 64) throw new Error('ENCRYPTION_KEY must be exactly 64 hex chars (32 bytes)')
  return Buffer.from(hex, 'hex')
}

export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Layout: iv(24 hex) + authTag(32 hex) + ciphertext(hex)
  return iv.toString('hex') + tag.toString('hex') + encrypted.toString('hex')
}

export function decrypt(ciphertext: string): string {
  const key = getKey()
  const iv = Buffer.from(ciphertext.slice(0, 24), 'hex')
  const tag = Buffer.from(ciphertext.slice(24, 56), 'hex')
  const encrypted = Buffer.from(ciphertext.slice(56), 'hex')
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

export function mask(plaintext: string): string {
  if (plaintext.length === 0) return ''
  if (plaintext.length <= 8) return '●'.repeat(plaintext.length)
  return plaintext.slice(0, 8) + '●'.repeat(8)
}
