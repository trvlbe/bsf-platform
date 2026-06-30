import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api.js'

const PLATFORM_ICONS: Record<string, string> = {
  TIKTOK: 'TT', INSTAGRAM: 'IG', YOUTUBE: 'YT', FACEBOOK: 'FB'
}
const PLATFORM_COLORS: Record<string, string> = {
  TIKTOK: 'bg-charcoal-900 text-white', INSTAGRAM: 'bg-brand text-white',
  YOUTUBE: 'bg-danger text-white', FACEBOOK: 'bg-charcoal-700 text-white'
}

export function CalendarView({ campaignId }: { campaignId: string }) {
  const { data: posts = [] } = useQuery({
    queryKey: ['posts', campaignId],
    queryFn: () => api.getPosts(campaignId),
  })

  if (!posts.length) return (
    <div className="py-12 text-center text-charcoal-400 font-sans">No posts yet — generate content first</div>
  )

  const byDay = new Map<number, any[]>()
  for (const post of posts) {
    const day = post.dayOffset
    if (!byDay.has(day)) byDay.set(day, [])
    byDay.get(day)!.push(post)
  }

  const days = [...byDay.keys()].sort((a, b) => a - b)

  return (
    <div className="flex flex-col gap-2">
      {days.map(day => (
        <div key={day} className={`flex gap-3 p-3 rounded border ${day === 0 ? 'border-brand bg-charcoal-050' : 'border-charcoal-100 bg-white'}`}>
          <div className={`w-16 shrink-0 flex flex-col items-center justify-center ${day === 0 ? 'text-brand' : 'text-charcoal-400'}`}>
            <div className="font-display font-semibold text-lg">{day === 0 ? 'DROP' : day > 0 ? `+${day}` : `${day}`}</div>
            <div className="text-xs font-mono">{new Date(byDay.get(day)![0].scheduledAt).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</div>
          </div>
          <div className="flex flex-wrap gap-2 flex-1">
            {byDay.get(day)!.map((post: any) => (
              <div key={post.id} className="flex items-start gap-2 bg-charcoal-050 rounded p-2 max-w-xs">
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded font-mono shrink-0 ${PLATFORM_COLORS[post.platform]}`}>{PLATFORM_ICONS[post.platform]}</span>
                <div>
                  <p className="text-xs text-charcoal-700 line-clamp-2">{post.caption}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    {post.bufferId
                      ? <span className="text-xs text-success font-medium">● Pushed</span>
                      : <span className="text-xs text-charcoal-400">○ Draft</span>
                    }
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
