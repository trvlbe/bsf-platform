import { describe, it, expect, vi } from 'vitest'

const mockPrisma = vi.hoisted(() => ({
  campaign: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  campaignArc: {
    upsert: vi.fn(),
  },
  post: { createMany: vi.fn().mockResolvedValue({ count: 29 }) },
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
    lyricSource: 'I keep thinking about us', assetNote: 'Cover art'
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
})
