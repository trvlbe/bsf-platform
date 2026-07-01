import { useState, useEffect } from 'react'
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
  const [lyricsUrl, setLyricsUrl] = useState('')
  const [showLyricsInput, setShowLyricsInput] = useState(false)
  const [brief, setBrief] = useState<string>('')

  const { data: campaign, isLoading } = useQuery({
    queryKey: ['campaign', id],
    queryFn: () => api.getCampaign(id!),
  })

  useEffect(() => {
    if (campaign?.creativeBrief) setBrief(campaign.creativeBrief)
  }, [campaign?.id])

  const lyricsMutation = useMutation({
    mutationFn: () => api.importLyrics(id!, lyricsUrl),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaign', id] }); setShowLyricsInput(false); setLyricsUrl('') },
    onError: (e: Error) => alert(`Lyrics import failed: ${e.message}`),
  })

  const generateMutation = useMutation({
    mutationFn: () => api.generateCampaign(id!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaign', id] }),
    onError: (e: Error) => alert(`Generation failed: ${e.message}`),
  })

  const analyzeMutation = useMutation({
    mutationFn: () => api.analyzeBrief(id!),
    onSuccess: (data) => setBrief(data.brief),
    onError: (e: Error) => alert(`Analysis failed: ${e.message}`),
  })

  const saveBriefMutation = useMutation({
    mutationFn: (text: string) => api.updateCampaign(id!, { creativeBrief: text }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaign', id] }),
    onError: (e: Error) => alert(`Failed to save brief: ${e.message}`),
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

        {!campaign.lyricsMarkdown && (
          <div className="mb-6 p-4 border border-dashed border-charcoal-300 rounded-lg bg-charcoal-50">
            {!showLyricsInput ? (
              <div className="flex items-center justify-between">
                <p className="text-sm text-charcoal-500">No lyrics imported yet — required before generating content.</p>
                <Button size="sm" variant="secondary" onClick={() => setShowLyricsInput(true)}>Import Lyrics →</Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <label className="font-display text-xs tracking-widest uppercase text-charcoal-500">Google Docs URL</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    placeholder="https://docs.google.com/document/d/..."
                    value={lyricsUrl}
                    onChange={e => setLyricsUrl(e.target.value)}
                    className="flex-1 border border-charcoal-200 rounded px-3 py-2.5 text-sm"
                  />
                  <Button size="sm" onClick={() => lyricsMutation.mutate()} disabled={!lyricsUrl || lyricsMutation.isPending}>
                    {lyricsMutation.isPending ? 'Importing...' : 'Import'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowLyricsInput(false)}>Cancel</Button>
                </div>
              </div>
            )}
          </div>
        )}

        {campaign.lyricsMarkdown && (
          <div className="mb-6 border border-charcoal-100 rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <label className="font-display text-xs tracking-widest uppercase text-charcoal-500">
                Creative Brief
              </label>
              <button
                onClick={() => analyzeMutation.mutate()}
                disabled={analyzeMutation.isPending}
                className="text-xs font-display uppercase tracking-wide text-brand hover:text-brand/70 transition-colors disabled:opacity-40"
              >
                {analyzeMutation.isPending ? 'Analyzing...' : '✦ Analyze Lyrics →'}
              </button>
            </div>
            <textarea
              value={brief}
              onChange={e => setBrief(e.target.value)}
              onBlur={() => { if (brief !== (campaign.creativeBrief ?? '')) saveBriefMutation.mutate(brief) }}
              placeholder="Describe the creative direction — key imagery, emotional arc, visual tone, hooks to build around. Claude will use this to shape the campaign arc."
              rows={8}
              className="w-full border border-charcoal-200 rounded px-3 py-2.5 text-sm text-charcoal-700 font-mono resize-y focus:outline-none focus:border-brand transition-colors"
            />
            {saveBriefMutation.isPending && (
              <p className="text-xs text-charcoal-400 mt-1">Saving...</p>
            )}
          </div>
        )}

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
