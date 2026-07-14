import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PostEditor } from '../../components/posts/PostEditor.js'
import { api } from '../../lib/api.js'

const PLATFORM_COLORS: Record<string, string> = {
  TIKTOK: 'text-charcoal-900',
  INSTAGRAM: 'text-brand',
  YOUTUBE: 'text-danger',
  FACEBOOK: 'text-charcoal-700',
}

function ApprovalBadge({ approved, bufferId }: { approved: boolean; bufferId: string | null }) {
  if (bufferId) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
        <span className="w-1.5 h-1.5 rounded-full bg-success" />
        Pushed
      </span>
    )
  }
  if (approved) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600">
        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
        Approved
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
      Needs Review
    </span>
  )
}

export function PostsView({ campaignId }: { campaignId: string }) {
  const [selected, setSelected] = useState<any>(null)

  const { data: posts = [] } = useQuery({
    queryKey: ['posts', campaignId],
    queryFn: () => api.getPosts(campaignId),
  })

  if (!posts.length) {
    return <div className="py-12 text-center text-charcoal-400">No posts yet</div>
  }

  return (
    <>
      <div className="bg-white border border-charcoal-100 rounded-md overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-charcoal-100">
              {['Day', 'Platform', 'Caption', 'Lyric Source', 'Status', ''].map(h => (
                <th
                  key={h}
                  className="px-4 py-3 text-left font-display text-xs tracking-widest uppercase text-charcoal-400"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {posts.map((post: any) => (
              <tr
                key={post.id}
                onClick={() => setSelected(post)}
                className="border-b border-charcoal-100 hover:bg-charcoal-050 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3 font-mono text-xs text-charcoal-500">
                  {post.dayOffset > 0 ? `+${post.dayOffset}` : post.dayOffset}
                </td>
                <td
                  className={`px-4 py-3 font-display text-xs font-bold uppercase tracking-wide ${PLATFORM_COLORS[post.platform]}`}
                >
                  {post.platform}
                </td>
                <td className="px-4 py-3 text-sm text-charcoal-700 max-w-xs truncate">
                  {post.caption}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-charcoal-400 max-w-xs truncate italic">
                  "{post.lyricSource}"
                </td>
                <td className="px-4 py-3">
                  <ApprovalBadge approved={post.approved} bufferId={post.bufferId} />
                </td>
                <td className="px-4 py-3 text-charcoal-400 text-xs">Review →</td>
              </tr>
            ))}
          </tbody>
        </table>
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
