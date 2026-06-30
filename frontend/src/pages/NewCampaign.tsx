import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useMutation } from '@tanstack/react-query'
import { AppShell } from '../components/layout/AppShell.js'
import { TopBar } from '../components/layout/TopBar.js'
import { Button } from '../components/ui/Button.js'
import { LyricsStep } from '../components/campaigns/LyricsStep.js'
import { useAuth } from '../lib/auth.js'
import { api } from '../lib/api.js'

const PLATFORMS = ['TIKTOK', 'INSTAGRAM', 'YOUTUBE', 'FACEBOOK'] as const

const STEPS = ['Basics', 'Lyrics', 'Settings']

export default function NewCampaign() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [lyricsMarkdown, setLyricsMarkdown] = useState('')
  const [form, setForm] = useState({
    title: '', artist: '', label: '', releaseDate: '', spotifyUrl: '',
    platforms: ['TIKTOK', 'INSTAGRAM'] as string[],
    brandTone: '', brandIdentity: '', videoEnabled: false
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const campaign = await api.createCampaign({ ...form })
      if (lyricsMarkdown) {
        await api.updateCampaign(campaign.id, { lyricsMarkdown })
      }
      return campaign
    },
    onSuccess: (c) => navigate(`/campaigns/${c.id}`)
  })

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const togglePlatform = (p: string) =>
    setForm(f => ({
      ...f,
      platforms: f.platforms.includes(p) ? f.platforms.filter(x => x !== p) : [...f.platforms, p]
    }))

  const fieldLabel = (text: string, htmlFor?: string) => (
    <label htmlFor={htmlFor} className="font-display text-xs tracking-widest uppercase text-charcoal-500 block mb-1">{text}</label>
  )

  const textInput = (props: React.InputHTMLAttributes<HTMLInputElement> & { name: string }) => (
    <input
      {...props}
      id={props.name}
      className="w-full border border-charcoal-200 rounded px-3 py-2.5 text-sm text-charcoal-900 focus:outline-none focus:border-brand transition-colors"
    />
  )

  return (
    <AppShell user={user!}>
      <TopBar eyebrow="Campaigns" title="New Campaign" />
      <div className="p-8 max-w-2xl">
        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i === step ? 'bg-brand text-white' : i < step ? 'bg-charcoal-600 text-white' : 'bg-charcoal-100 text-charcoal-400'}`}>{i + 1}</div>
              <span className={`text-sm font-display uppercase tracking-wide ${i === step ? 'text-charcoal-900' : 'text-charcoal-400'}`}>{s}</span>
              {i < STEPS.length - 1 && <div className="w-8 h-px bg-charcoal-200 mx-1" />}
            </div>
          ))}
        </div>

        {step === 0 && (
          <div className="flex flex-col gap-4">
            <div>{fieldLabel('Title', 'title')}{textInput({ name: 'title', placeholder: 'Title', value: form.title, onChange: set('title') })}</div>
            <div className="grid grid-cols-2 gap-4">
              <div>{fieldLabel('Artist', 'artist')}{textInput({ name: 'artist', placeholder: 'Artist', value: form.artist, onChange: set('artist') })}</div>
              <div>{fieldLabel('Label', 'label')}{textInput({ name: 'label', placeholder: 'Label', value: form.label, onChange: set('label') })}</div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>{fieldLabel('Release Date', 'releaseDate')}{textInput({ name: 'releaseDate', type: 'date', value: form.releaseDate, onChange: set('releaseDate') })}</div>
              <div>{fieldLabel('Spotify URL', 'spotifyUrl')}{textInput({ name: 'spotifyUrl', placeholder: 'https://open.spotify.com/...', value: form.spotifyUrl, onChange: set('spotifyUrl') })}</div>
            </div>
            <div>
              {fieldLabel('Platforms')}
              <div className="flex gap-2 flex-wrap">
                {PLATFORMS.map(p => (
                  <button key={p} type="button" onClick={() => togglePlatform(p)}
                    className={`px-3 py-1.5 rounded text-xs font-display uppercase tracking-wide border transition-colors ${form.platforms.includes(p) ? 'bg-brand text-white border-brand' : 'border-charcoal-200 text-charcoal-500 hover:border-charcoal-600'}`}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <Button onClick={() => setStep(1)} disabled={!form.title}>Next →</Button>
            </div>
          </div>
        )}

        {step === 1 && (
          <LyricsStep
            lyricsMarkdown={lyricsMarkdown}
            onLyricsChange={setLyricsMarkdown}
            onBack={() => setStep(0)}
            onNext={() => setStep(2)}
          />
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            <div>{fieldLabel('Brand Tone', 'brandTone')}{textInput({ name: 'brandTone', placeholder: 'e.g. Warm and honest, indie roots', value: form.brandTone, onChange: set('brandTone') })}</div>
            <div>{fieldLabel('Brand Identity', 'brandIdentity')}{textInput({ name: 'brandIdentity', placeholder: 'e.g. Indie alt-pop with folk influences', value: form.brandIdentity, onChange: set('brandIdentity') })}</div>
            <div className="flex items-center gap-3">
              <input type="checkbox" id="videoEnabled" checked={form.videoEnabled} onChange={e => setForm(f => ({ ...f, videoEnabled: e.target.checked }))} />
              <label htmlFor="videoEnabled" className="font-sans text-sm text-charcoal-700">Enable Higgsfield video generation</label>
            </div>
            <div className="flex justify-between mt-4">
              <Button variant="ghost" onClick={() => setStep(1)}>← Back</Button>
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.brandTone}>
                {createMutation.isPending ? 'Creating...' : 'Create Campaign →'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
