import type { Campaign } from '@prisma/client'

export interface PostSlot {
  dayOffset: number      // -14..+14; 0 = release day
  platform: string       // 'TIKTOK' | 'INSTAGRAM' | 'YOUTUBE' | 'FACEBOOK'
  scheduledAt: Date
}

const PLATFORM_TIMES: Record<string, number> = {
  TIKTOK: 19,
  INSTAGRAM: 18,
  YOUTUBE: 14,
  FACEBOOK: 13,
}

export function buildPostSlots(campaign: Campaign): PostSlot[] {
  const slots: PostSlot[] = []
  const totalDays = campaign.preReleaseDays + 1 + campaign.postReleaseDays
  const startOffset = -campaign.preReleaseDays

  for (let i = 0; i < totalDays; i++) {
    const dayOffset = startOffset + i
    for (const platform of campaign.platforms) {
      const d = new Date(campaign.releaseDate)
      d.setUTCDate(d.getUTCDate() + dayOffset)
      d.setUTCHours(PLATFORM_TIMES[platform] ?? 18, 0, 0, 0)
      slots.push({ dayOffset, platform, scheduledAt: d })
    }
  }
  return slots
}
