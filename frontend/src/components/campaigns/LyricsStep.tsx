import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button } from '../ui/Button.js'
import { api } from '../../lib/api.js'

interface Props {
  lyricsMarkdown: string
  onLyricsChange: (md: string) => void
  onBack: () => void
  onNext: () => void
}

export function LyricsStep({ lyricsMarkdown, onLyricsChange, onBack, onNext }: Props) {
  const [docUrl, setDocUrl] = useState('')

  const fetchMutation = useMutation({
    mutationFn: async () => {
      const { lyricsMarkdown } = await api.parseLyrics(docUrl)
      return lyricsMarkdown
    },
    onSuccess: (md) => {
      onLyricsChange(md)
    }
  })

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="font-display text-xs tracking-widest uppercase text-charcoal-500 block mb-1">Google Docs URL</label>
        <div className="flex gap-2">
          <input
            type="url"
            placeholder="https://docs.google.com/document/d/..."
            value={docUrl}
            onChange={e => setDocUrl(e.target.value)}
            className="flex-1 border border-charcoal-200 rounded px-3 py-2.5 text-sm"
          />
          <Button variant="secondary" size="sm" onClick={() => fetchMutation.mutate()} disabled={!docUrl || fetchMutation.isPending}>
            {fetchMutation.isPending ? 'Fetching...' : 'Fetch Doc'}
          </Button>
        </div>
        <p className="text-xs text-charcoal-400 mt-1.5">Make sure your Google Doc is shared with your Google account. Claude will parse the formatting.</p>
      </div>

      {lyricsMarkdown && (
        <div>
          <label className="font-display text-xs tracking-widest uppercase text-charcoal-500 block mb-1">Parsed Lyrics Preview</label>
          <textarea
            value={lyricsMarkdown}
            onChange={e => onLyricsChange(e.target.value)}
            rows={12}
            className="w-full border border-charcoal-200 rounded px-3 py-2.5 text-sm font-mono text-charcoal-700 resize-y"
          />
        </div>
      )}

      <div className="flex justify-between mt-2">
        <Button variant="ghost" onClick={onBack}>← Back</Button>
        <Button onClick={onNext}>Next →</Button>
      </div>
    </div>
  )
}
