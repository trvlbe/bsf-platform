import { describe, it, expect, vi, beforeAll } from 'vitest'

beforeAll(() => {
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key'
})

const mockPrisma = vi.hoisted(() => ({
  campaign: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  campaignArc: {
    upsert: vi.fn(),
  },
  post: {
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    createMany: vi.fn().mockResolvedValue({ count: 29 })
  },
  user: {
    findUnique: vi.fn(),
  },
  $transaction: vi.fn(),
}))

vi.mock('../src/lib/db.js', () => ({ prisma: mockPrisma }))

vi.mock('../src/agents/arcAgent.js', () => ({
  runArcAgent: vi.fn().mockResolvedValue({
    preTheme: 'longing', dropDayTheme: 'release', postTheme: 'nostalgia',
    motifs: ['I keep thinking about us'], rawJson: '{}'
  })
}))

vi.mock('../src/agents/contentAgent.js', () => ({
  runContentAgent: vi.fn().mockResolvedValue([{
    platform: 'TIKTOK', caption: 'Test', hashtags: ['#test'],
    lyricSource: 'I keep thinking about us', assetNote: 'Cover art', youtubeTitlePhrase: 'test phrase'
  }])
}))

import { generateCampaign } from '../src/commands/generate.js'

describe('generateCampaign', () => {
  it('throws if campaign not found', async () => {
    mockPrisma.campaign.findFirst.mockResolvedValue(null)
    await expect(generateCampaign('bad-id', 'user-1')).rejects.toThrow('not found')
  })

  it('throws if lyricsMarkdown is missing', async () => {
    mockPrisma.campaign.findFirst.mockResolvedValue({ id: 'c1', lyricsMarkdown: null, platforms: ['TIKTOK'] })
    await expect(generateCampaign('c1', 'user-1')).rejects.toThrow('lyrics')
  })

  it('sets directionBrief from the content agent\'s assetNote on every created post', async () => {
    mockPrisma.campaign.findFirst.mockResolvedValue({
      id: 'c1',
      lyricsMarkdown: '## Verse 1\nI keep thinking about us',
      platforms: ['TIKTOK'],
      preReleaseDays: 0,
      postReleaseDays: 0,
      releaseDate: new Date('2026-09-01'),
      contentOrientation: 'VERTICAL',
      contentDuration: 'SHORT_FORM',
      contentResolution: '1080p',
      creativeBrief: null,
      songAnalysis: null,
      assetsFolderUrl: null,
    })
    mockPrisma.user.findUnique.mockResolvedValue(null)
    await generateCampaign('c1', 'user-1')
    const created = mockPrisma.post.createMany.mock.calls[0][0].data
    expect(created).toHaveLength(1)
    expect(created[0].directionBrief).toBe('Cover art')
    expect(created[0].directionBrief).toBe(created[0].assetNote)
  })
})
