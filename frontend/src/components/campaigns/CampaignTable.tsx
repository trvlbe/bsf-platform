import { useNavigate } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight } from 'lucide-react'
import { StatusBadge } from '../ui/StatusBadge.js'
import { api } from '../../lib/api.js'

export function CampaignTable({ campaigns }: { campaigns: any[] }) {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteCampaign(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
    onError: (e: Error) => alert(`Delete failed: ${e.message}`),
  })

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
            {['Title', 'Artist', 'Release', 'Status', 'Posts', '', ''].map((h, i) => (
              <th key={i} className="px-4 py-3 text-left font-display text-xs tracking-widest uppercase text-charcoal-400">{h}</th>
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
              <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => {
                    if (window.confirm(`Delete "${c.title}"? This cannot be undone.`)) {
                      deleteMutation.mutate(c.id)
                    }
                  }}
                  disabled={deleteMutation.isPending}
                  className="text-xs text-charcoal-300 hover:text-danger transition-colors disabled:opacity-40"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
