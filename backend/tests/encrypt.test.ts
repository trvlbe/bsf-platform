import { describe, it, expect } from 'vitest'
import { encrypt, decrypt, mask } from '../src/lib/encrypt.js'

describe('encrypt/decrypt', () => {
  it('round-trips a value', () => {
    const original = 'sk-ant-api03-secretkey'
    expect(decrypt(encrypt(original))).toBe(original)
  })

  it('produces different ciphertext each time (random IV)', () => {
    const val = 'same-value'
    expect(encrypt(val)).not.toBe(encrypt(val))
  })

  it('throws on tampered ciphertext', () => {
    const ciphertext = encrypt('hello')
    const tampered = ciphertext.slice(0, -2) + 'ff'
    expect(() => decrypt(tampered)).toThrow()
  })
})

describe('mask', () => {
  it('shows first 8 chars + 8 bullets for long strings', () => {
    expect(mask('sk-ant-api03-verylongkey')).toBe('sk-ant-a●●●●●●●●')
  })

  it('masks entirely if 8 chars or fewer', () => {
    expect(mask('short')).toBe('●●●●●')
    expect(mask('exactly8')).toBe('●●●●●●●●')
  })

  it('returns empty string for empty input', () => {
    expect(mask('')).toBe('')
  })
})
