import { useState } from 'react'
import { useParams } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AppShell } from '../../components/layout/AppShell.js'
import { TopBar } from '../../components/layout/TopBar.js'
import { Button } from '../../components/ui/Button.js'
import { MetricTile } from '../../components/ui/MetricTile.js'
import { StatusBadge } from '../../components/ui/StatusBadge.js'
import { CalendarView } from './CalendarView.js'
import { PostsView } from './PostsView.js'
import { useAuth } from '../../lib/auth.js'
import { api } from '../../lib/api.js'

type Tab = 'calendar' | 'posts'

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('calendar')

  const { data: campaign, isLoading } = useQuery({
    queryKey: ['campaign', id],
    queryFn: () => api.getCampaign(id!),
  })

  const generateMutation = useMutation({
    mutationFn: () => api.generateCampaign(id!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaign', id] })
  })

  const pushMutation = useMutation({
    mutationFn: () => api.pushCampaign(id!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaign', id] })
  })

  if (isLoading || !campaign) return (
    <div className="min-h-screen bg-paper flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const canGenerate = campaign.status === 'DRAFT' && campaign.lyricsMarkdown
  const canPush = campaign.status === 'GENERATED' || campaign.status === 'ACTIVE'

  return (
    <AppShell user={user!}>
      <TopBar
        eyebrow="Campaigns"
        title={campaign.title}
        action={
          <div className="flex items-center gap-2">
            <StatusBadge status={campaign.status} />
            {canGenerate && (
              <Button size="sm" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
                {generateMutation.isPending ? 'Generating...' : 'Generate Content →'}
              </Button>
            )}
            {canPush && (
              <Button size="sm" variant="secondary" onClick={() => pushMutation.mutate()} disabled={pushMutation.isPending}>
                {pushMutation.isPending ? 'Pushing...' : 'Push to Buffer →'}
              </Button>
            )}
          </div>
        }
      />

      <div className="px-8 py-6">
        <div className="flex gap-4 mb-6">
          <MetricTile label="Posts Generated" value={campaign._count?.posts ?? 0} />
          <MetricTile label="Pushed to Buffer" value={campaign.pushedCount ?? 0} />
          <MetricTile label="Artist" value={campaign.artist} />
          <MetricTile label="Release" value={new Date(campaign.releaseDate).toLocaleDateString()} />
        </div>

        <div className="flex gap-1 border-b border-charcoal-100 mb-6">
          {(['calendar', 'posts'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 font-display text-xs tracking-widest uppercase transition-colors duration-[120ms] border-b-2 -mb-px ${tab === t ? 'border-brand text-brand' : 'border-transparent text-charcoal-400 hover:text-charcoal-700'}`}>
              {t}
            </button>
          ))}
        </div>

        {tab === 'calendar' && <CalendarView campaignId={id!} />}
        {tab === 'posts' && <PostsView campaignId={id!} />}
      </div>
    </AppShell>
  )
}
