import { describe, it, expect, vi } from 'vitest'
import { extractDocId, extractFileId } from '../src/lib/driveClient.js'

describe('driveClient URL parsing', () => {
  it('extracts doc ID from Google Docs URL', () => {
    const url = 'https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/edit'
    expect(extractDocId(url)).toBe('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms')
  })

  it('extracts file ID from Drive URL', () => {
    const url = 'https://drive.google.com/file/d/1ABC123xyz/view'
    expect(extractFileId(url)).toBe('1ABC123xyz')
  })

  it('throws on invalid URL', () => {
    expect(() => extractDocId('https://example.com')).toThrow()
  })
})
