import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { AppShell } from '../components/layout/AppShell.js'
import { TopBar } from '../components/layout/TopBar.js'
import { MetricTile } from '../components/ui/MetricTile.js'
import { Button } from '../components/ui/Button.js'
import { CampaignTable } from '../components/campaigns/CampaignTable.js'
import { useAuth } from '../lib/auth.js'
import { api } from '../lib/api.js'

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: campaigns = [] } = useQuery({ queryKey: ['campaigns'], queryFn: api.getCampaigns })

  const activeCampaigns = campaigns.filter((c: any) => ['GENERATING', 'GENERATED', 'PUBLISHING', 'ACTIVE'].includes(c.status)).length
  const totalPosts = campaigns.reduce((s: number, c: any) => s + (c._count?.posts ?? 0), 0)
  const totalPushed = campaigns.reduce((s: number, c: any) => s + (c.pushedCount ?? 0), 0)

  return (
    <AppShell user={user!}>
      <TopBar
        eyebrow="Blue Sky Fable"
        title="Dashboard"
        action={<Button onClick={() => navigate('/campaigns/new')} size="sm">New Campaign →</Button>}
      />
      <div className="p-8 flex flex-col gap-8">
        <div className="flex gap-4 flex-wrap">
          <MetricTile label="Active Campaigns" value={activeCampaigns} />
          <MetricTile label="Posts Generated" value={totalPosts} />
          <MetricTile label="Pushed to Buffer" value={totalPushed} />
          <MetricTile label="Campaigns" value={campaigns.length} brand />
        </div>
        <div className="bg-white border border-charcoal-100 rounded-md shadow-sm">
          <div className="flex items-center justify-between px-4 py-4 border-b border-charcoal-100">
            <h2 className="font-display text-sm tracking-widest uppercase text-charcoal-900">Campaigns</h2>
          </div>
          <CampaignTable campaigns={campaigns} />
        </div>
      </div>
    </AppShell>
  )
}
