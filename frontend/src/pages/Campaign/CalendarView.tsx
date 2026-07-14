import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PostEditor } from '../../components/posts/PostEditor.js'
import { api } from '../../lib/api.js'

const PLATFORM_ICONS: Record<string, string> = {
  TIKTOK: 'TT', INSTAGRAM: 'IG', YOUTUBE: 'YT', FACEBOOK: 'FB'
}
const PLATFORM_COLORS: Record<string, string> = {
  TIKTOK: 'bg-charcoal-900 text-white', INSTAGRAM: 'bg-brand text-white',
  YOUTUBE: 'bg-danger text-white', FACEBOOK: 'bg-charcoal-700 text-white'
}

function GeneratingCalendar() {
  return (
    <div className="flex flex-col gap-2">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex gap-3 p-3 rounded border border-charcoal-100 bg-white animate-pulse">
          <div className="w-16 shrink-0 flex flex-col items-center justify-center gap-1">
            <div className="h-5 w-10 bg-charcoal-100 rounded" />
            <div className="h-3 w-12 bg-charcoal-100 rounded" />
          </div>
          <div className="flex gap-2 flex-1">
            {[...Array(3)].map((_, j) => (
              <div key={j} className="h-14 w-40 bg-charcoal-100 rounded" />
            ))}
          </div>
        </div>
      ))}
      <p className="text-center text-xs text-charcoal-400 mt-2 font-display uppercase tracking-widest">
        Still Generating…
      </p>
    </div>
  )
}

export function CalendarView({ campaignId, isGenerating }: { campaignId: string; isGenerating?: boolean }) {
  const [selected, setSelected] = useState<any>(null)

  const { data: posts = [] } = useQuery({
    queryKey: ['posts', campaignId],
    queryFn: () => api.getPosts(campaignId),
  })

  if (isGenerating && !posts.length) return <GeneratingCalendar />

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
    <>
      <div className="flex flex-col gap-2">
        {days.map(day => (
          <div key={day} className={`flex gap-3 p-3 rounded border ${day === 0 ? 'border-brand bg-charcoal-050' : 'border-charcoal-100 bg-white'}`}>
            <div className={`w-16 shrink-0 flex flex-col items-center justify-center ${day === 0 ? 'text-brand' : 'text-charcoal-400'}`}>
              <div className="font-display font-semibold text-lg">{day === 0 ? 'DROP' : day > 0 ? `+${day}` : `${day}`}</div>
              <div className="text-xs font-mono">{new Date(byDay.get(day)![0].scheduledAt).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</div>
            </div>
            <div className="flex flex-wrap gap-2 flex-1">
              {byDay.get(day)!.map((post: any) => (
                <div
                  key={post.id}
                  onClick={() => setSelected(post)}
                  className="flex items-start gap-2 bg-charcoal-050 hover:bg-charcoal-100 rounded p-2 max-w-xs cursor-pointer transition-colors group"
                >
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded font-mono shrink-0 ${PLATFORM_COLORS[post.platform]}`}>{PLATFORM_ICONS[post.platform]}</span>
                  <div>
                    <p className="text-xs text-charcoal-700 line-clamp-2">{post.caption}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      {post.bufferId
                        ? <span className="text-xs text-success font-medium">● Pushed</span>
                        : post.approved
                        ? <span className="text-xs text-indigo-600 font-medium">● Approved</span>
                        : <span className="text-xs text-charcoal-400">○ Draft</span>
                      }
                      <span className="text-xs text-charcoal-300 group-hover:text-charcoal-500 transition-colors ml-1">Review →</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <PostEditor
          post={selected}
          campaignId={campaignId}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}
