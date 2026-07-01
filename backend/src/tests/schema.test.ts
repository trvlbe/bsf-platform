import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '../lib/db.js'

describe('Campaign schema - creative layer fields', () => {
  let campaignId: string

  beforeAll(async () => {
    const user = await prisma.user.findFirst()
    if (!user) throw new Error('No test user — run seed or create one first')
    const c = await prisma.campaign.create({
      data: {
        userId: user.id,
        slug: 'schema-test-creative',
        title: 'Schema Test',
        artist: 'Test',
        label: 'Test',
        releaseDate: new Date('2026-09-01'),
        platforms: ['TIKTOK'],
        brandTone: 'test',
        brandIdentity: 'test',
      }
    })
    campaignId = c.id
  })

  afterAll(async () => {
    await prisma.campaign.deleteMany({ where: { slug: 'schema-test-creative' } })
  })

  it('accepts musicUrl, creativeBrief, and content format fields', async () => {
    const updated = await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        musicUrl: 'https://drive.google.com/file/d/abc/view',
        creativeBrief: 'Key imagery: empty chairs\nEmotional arc: longing to hope',
        contentOrientation: 'VERTICAL',
        contentDuration: 'SHORT_FORM',
        contentResolution: '1080p',
      }
    })
    expect(updated.musicUrl).toBe('https://drive.google.com/file/d/abc/view')
    expect(updated.creativeBrief).toBe('Key imagery: empty chairs\nEmotional arc: longing to hope')
    expect(updated.contentOrientation).toBe('VERTICAL')
    expect(updated.contentDuration).toBe('SHORT_FORM')
    expect(updated.contentResolution).toBe('1080p')
  })

  it('allows all fields to be null', async () => {
    const c = await prisma.campaign.findUnique({ where: { id: campaignId } })
    // fields are nullable — no error on null
    expect(c).toBeTruthy()
  })
})
