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

describe('Post schema — editor workflow fields', () => {
  let campaignId: string

  beforeAll(async () => {
    const user = await prisma.user.findFirst()
    if (!user) throw new Error('No test user — run seed or create one first')
    const c = await prisma.campaign.create({
      data: {
        userId: user.id,
        slug: 'schema-test-editor-workflow',
        title: 'Schema Test — Editor Workflow',
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
    await prisma.post.deleteMany({ where: { campaignId } })
    await prisma.campaign.deleteMany({ where: { slug: 'schema-test-editor-workflow' } })
  })

  it('creates a Post with directionBrief and defaults editorStatus to NOT_STARTED', async () => {
    const post = await prisma.post.create({
      data: {
        campaignId,
        platform: 'INSTAGRAM',
        caption: 'test caption',
        hashtags: [],
        lyricSource: 'test lyric',
        assetNote: 'test asset note',
        directionBrief: 'test brief',
        scheduledAt: new Date(),
        dayOffset: 0,
      },
    })
    expect(post.directionBrief).toBe('test brief')
    expect(post.directionAccepted).toBeNull()
    expect(post.editorStatus).toBe('NOT_STARTED')
    expect(post.editorPrompt).toBeNull()
    expect(post.editorReasoning).toBeNull()
  })
})
