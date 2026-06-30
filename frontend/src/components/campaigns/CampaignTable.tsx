import { useNavigate } from 'react-router'
import { ArrowUpRight } from 'lucide-react'
import { StatusBadge } from '../ui/StatusBadge.js'

export function CampaignTable({ campaigns }: { campaigns: any[] }) {
  const navigate = useNavigate()
  if (!campaigns.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-charcoal-400">
        <p className="font-sans mb-4">No campaigns yet</p>
      </div>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-charcoal-100">
            {['Title', 'Artist', 'Release', 'Status', 'Posts', ''].map(h => (
              <th key={h} className="px-4 py-3 text-left font-display text-xs tracking-widest uppercase text-charcoal-400">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {campaigns.map(c => (
            <tr key={c.id} onClick={() => navigate(`/campaigns/${c.id}`)} className="border-b border-charcoal-100 hover:bg-charcoal-050 cursor-pointer transition-colors duration-[120ms]">
              <td className="px-4 py-3 font-medium text-charcoal-900">{c.title}</td>
              <td className="px-4 py-3 text-charcoal-600 text-sm">{c.artist}</td>
              <td className="px-4 py-3 font-mono text-xs text-charcoal-500">{new Date(c.releaseDate).toLocaleDateString()}</td>
              <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
              <td className="px-4 py-3 font-mono text-xs text-charcoal-500">{c._count?.posts ?? 0} / {c.pushedCount ?? 0} pushed</td>
              <td className="px-4 py-3 text-charcoal-400"><ArrowUpRight size={16} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
