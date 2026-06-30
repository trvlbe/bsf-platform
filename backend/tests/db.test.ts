import { describe, it, expect, afterAll } from 'vitest'
import { prisma } from '../src/lib/db.js'

describe('database models', () => {
  const stamp = Date.now()
  let userId: string
  let campaignId: string

  afterAll(async () => {
    await prisma.post.deleteMany({ where: { campaign: { userId } } })
    await prisma.campaignArc.deleteMany({ where: { campaign: { userId } } })
    await prisma.campaign.deleteMany({ where: { userId } })
    await prisma.user.delete({ where: { id: userId } })
    await prisma.$disconnect()
  })

  it('creates a User', async () => {
    const user = await prisma.user.create({
      data: { googleId: `g_${stamp}`, email: `t${stamp}@test.com`, name: 'Test User' }
    })
    userId = user.id
    expect(user.email).toContain('@test.com')
    expect(user.createdAt).toBeInstanceOf(Date)
  })

  it('creates a Campaign with DRAFT status', async () => {
    const campaign = await prisma.campaign.create({
      data: {
        userId,
        slug: `test-${stamp}`,
        title: 'Think About Us',
        artist: 'Blue Sky Fable',
        label: 'BSF Records',
        releaseDate: new Date('2026-09-01'),
        platforms: ['TIKTOK', 'INSTAGRAM'],
        brandTone: 'Warm and honest',
        brandIdentity: 'Indie alt-pop',
      }
    })
    campaignId = campaign.id
    expect(campaign.status).toBe('DRAFT')
    expect(campaign.platforms).toContain('TIKTOK')
  })

  it('enforces unique [userId, slug]', async () => {
    await expect(
      prisma.campaign.create({
        data: {
          userId,
          slug: `test-${stamp}`,
          title: 'Dupe',
          artist: 'BSF',
          label: 'BSF',
          releaseDate: new Date(),
          platforms: ['TIKTOK'],
          brandTone: 'x',
          brandIdentity: 'x',
        }
      })
    ).rejects.toThrow()
  })

  it('creates a Post with required lyricSource', async () => {
    const post = await prisma.post.create({
      data: {
        campaignId,
        platform: 'TIKTOK',
        caption: 'Day -7 TikTok caption',
        hashtags: ['#bsf', '#indiemusic'],
        lyricSource: 'I keep thinking about us',
        assetNote: 'Cover art',
        scheduledAt: new Date('2026-08-25T19:00:00Z'),
        dayOffset: -7,
      }
    })
    expect(post.lyricSource).toBe('I keep thinking about us')
    expect(post.bufferId).toBeNull()
  })

  it('cascade deletes posts when campaign is deleted', async () => {
    const tempCampaign = await prisma.campaign.create({
      data: {
        userId,
        slug: `cascade-test-${stamp}`,
        title: 'Cascade Test',
        artist: 'BSF',
        label: 'BSF',
        releaseDate: new Date(),
        platforms: ['TIKTOK'],
        brandTone: 'x',
        brandIdentity: 'x',
      }
    })
    await prisma.post.create({
      data: {
        campaignId: tempCampaign.id,
        platform: 'TIKTOK',
        caption: 'x',
        hashtags: [],
        lyricSource: 'x',
        assetNote: 'x',
        scheduledAt: new Date(),
        dayOffset: 0,
      }
    })
    await prisma.campaign.delete({ where: { id: tempCampaign.id } })
    const posts = await prisma.post.findMany({ where: { campaignId: tempCampaign.id } })
    expect(posts).toHaveLength(0)
  })
})
