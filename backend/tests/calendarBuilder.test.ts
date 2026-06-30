import { describe, it, expect } from 'vitest'
import { buildPostSlots } from '../src/lib/calendarBuilder.js'
import type { Campaign } from '@prisma/client'

const mockCampaign = {
  releaseDate: new Date('2026-09-01T00:00:00Z'),
  platforms: ['TIKTOK', 'INSTAGRAM'],
  preReleaseDays: 14,
  postReleaseDays: 14,
} as Campaign

describe('calendarBuilder', () => {
  it('builds 29 days of slots', () => {
    const slots = buildPostSlots(mockCampaign)
    const days = new Set(slots.map(s => s.dayOffset))
    expect(days.size).toBe(29)
    expect(days.has(-14)).toBe(true)
    expect(days.has(0)).toBe(true)
    expect(days.has(14)).toBe(true)
  })

  it('creates one slot per platform per day', () => {
    const slots = buildPostSlots(mockCampaign)
    const day0 = slots.filter(s => s.dayOffset === 0)
    expect(day0).toHaveLength(2) // TIKTOK + INSTAGRAM
  })

  it('schedules TikTok at 19:00 UTC', () => {
    const slots = buildPostSlots(mockCampaign)
    const tiktokDay0 = slots.find(s => s.dayOffset === 0 && s.platform === 'TIKTOK')!
    expect(tiktokDay0.scheduledAt.getUTCHours()).toBe(19)
  })

  it('total slots = platforms × days', () => {
    const slots = buildPostSlots(mockCampaign)
    expect(slots).toHaveLength(29 * 2)
  })
})
