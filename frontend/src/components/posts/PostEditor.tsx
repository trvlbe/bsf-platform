import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { Button } from '../ui/Button.js'
import { PlatformPreview } from './PlatformPreview.js'
import { api } from '../../lib/api.js'

interface Props {
  post: any
  campaignId: string
  onClose: () => void
}

export function PostEditor({ post: initialPost, campaignId, onClose }: Props) {
  const qc = useQueryClient()

  const [livePost, setLivePost] = useState<any>(initialPost)
  const [caption, setCaption] = useState<string>(initialPost.caption)
  const [hashtags, setHashtags] = useState<string>(initialPost.hashtags.join(', '))
  const [directionBrief, setDirectionBrief] = useState<string>(initialPost.directionBrief)
  const [isEditingDirection, setIsEditingDirection] = useState(false)
  const [feedback, setFeedback] = useState('')

  const stage: 1 | 2 | 3 = !livePost.directionAccepted
    ? 1
    : (livePost.editorStatus === 'READY' || livePost.editorStatus === 'FAILED')
      ? 3
      : 2

  const acceptDirectionMutation = useMutation({
    mutationFn: (edited: boolean) =>
      api.updateDirection(campaignId, initialPost.id, edited
        ? { caption, hashtags: hashtags.split(',').map((h: string) => h.trim()).filter(Boolean), directionBrief }
        : {}),
    onSuccess: (updated) => {
      setLivePost(updated)
      setIsEditingDirection(false)
      qc.invalidateQueries({ queryKey: ['posts', campaignId] })
    },
    onError: (e: Error) => alert(`Accepting direction failed: ${e.message}`),
  })

  const isEditorPending = livePost.editorStatus === 'PENDING'

  const { data: campaignAssets, isLoading: assetsLoading } = useQuery({
    queryKey: ['assets', campaignId],
    queryFn: () => api.getAssets(campaignId),
  })
  const hasVerifiedAssets = !assetsLoading && !!campaignAssets?.some((a: any) => a.mimeType.startsWith('image/'))
  const noAssetsMessage = 'No verified image assets in this campaign — add a Drive assets folder with at least one image in campaign settings before sending to the editor agent.'

  const { data: polledPost } = useQuery({
    queryKey: ['post', campaignId, initialPost.id],
    queryFn: () => api.getPost(campaignId, initialPost.id),
    refetchInterval: isEditorPending ? 3000 : false,
    enabled: isEditorPending,
  })
  useEffect(() => {
    if (polledPost) setLivePost(polledPost)
  }, [polledPost])

  const sendToEditorMutation = useMutation({
    mutationFn: () => api.sendToEditor(campaignId, initialPost.id),
    onSuccess: (updated) => {
      setLivePost(updated)
      qc.invalidateQueries({ queryKey: ['posts', campaignId] })
    },
    onError: (e: Error) => alert(`Send to editor failed: ${e.message}`),
  })

  const regenerateMutation = useMutation({
    mutationFn: () => api.regeneratePost(campaignId, initialPost.id, feedback.trim() || undefined),
    onSuccess: (updated) => {
      setLivePost(updated)
      setFeedback('')
      qc.invalidateQueries({ queryKey: ['posts', campaignId] })
    },
    onError: (e: Error) => alert(`Regenerate failed: ${e.message}`),
  })

  const saveMutation = useMutation({
    mutationFn: () =>
      api.updatePost(campaignId, initialPost.id, {
        caption,
        hashtags: hashtags.split(',').map((h: string) => h.trim()).filter(Boolean),
      }),
    onSuccess: (updated) => {
      setLivePost(updated)
      qc.invalidateQueries({ queryKey: ['posts', campaignId] })
    },
  })

  const approveMutation = useMutation({
    mutationFn: () => api.approvePost(campaignId, initialPost.id),
    onSuccess: (updated) => {
      setLivePost(updated)
      qc.invalidateQueries({ queryKey: ['posts', campaignId] })
    },
    onError: (e: Error) => alert(`Approval failed: ${e.message}`),
  })

  const pushMutation = useMutation({
    mutationFn: () => api.pushPost(campaignId, initialPost.id),
    onSuccess: (updated) => {
      setLivePost(updated)
      qc.invalidateQueries({ queryKey: ['posts', campaignId] })
      onClose()
    },
    onError: (e: Error) => setLivePost((prev: any) => ({ ...prev, pushError: e.message })),
  })

  const isApproved = livePost.approved

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white w-full max-w-3xl flex flex-col shadow-xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-charcoal-100 shrink-0">
          <div>
            <div className="font-display text-xs tracking-widest uppercase text-charcoal-400">
              {livePost.platform} · Day {livePost.dayOffset > 0 ? `+${livePost.dayOffset}` : livePost.dayOffset}
            </div>
            <h3 className="font-display font-medium text-lg uppercase text-charcoal-900">
              {livePost.platform} Post
            </h3>
          </div>
          <button onClick={onClose} className="text-charcoal-400 hover:text-charcoal-900 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Two-column body */}
        <div className="flex flex-1 overflow-hidden">

          {/* Left: preview */}
          <div className="w-80 border-r border-charcoal-100 flex flex-col overflow-y-auto bg-charcoal-050 shrink-0">
            <div className="flex items-start justify-center py-6 px-4">
              <PlatformPreview
                platform={livePost.platform}
                caption={caption}
                hashtags={hashtags.split(',').map((h: string) => h.trim()).filter(Boolean)}
                scheduledAt={livePost.scheduledAt}
                videoUrl={livePost.videoUrl}
                assetFileId={livePost.assetFileId}
                assetMimeType={livePost.assetMimeType}
              />
            </div>
            {stage === 3 && (
              <div className="px-4 pb-6 border-t border-charcoal-100 pt-4">
                <div className="font-display text-xs tracking-widest uppercase text-charcoal-400 mb-2">
                  Editor Agent
                </div>
                {livePost.editorStatus === 'READY' && (
                  <>
                    <p className="text-xs text-charcoal-600 mb-2">{livePost.editorReasoning}</p>
                    {livePost.editorPrompt && (
                      <div className="text-xs text-charcoal-500 bg-white border border-charcoal-100 rounded p-2 font-mono">
                        {livePost.editorPrompt}
                      </div>
                    )}
                    {!livePost.assetFileId && (
                      <p className="text-xs text-charcoal-400 mt-2">Caption-only post — no image asset fit the direction.</p>
                    )}
                    {isApproved ? (
                      <p className="text-xs text-charcoal-400 mt-2">Approved for push.</p>
                    ) : (
                      <p className="text-xs text-charcoal-400 mt-2">Review before approving.</p>
                    )}
                  </>
                )}
                {livePost.editorStatus === 'FAILED' && (
                  <p className="text-xs text-danger">Editor agent failed — try regenerating.</p>
                )}
              </div>
            )}
          </div>

          {/* Right: direction / content + actions */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-6 flex flex-col gap-5 flex-1 overflow-y-auto">

              <div>
                <div className="font-display text-xs tracking-widest uppercase text-charcoal-400 mb-2">
                  Lyric Source
                </div>
                <div className="font-mono text-sm bg-charcoal-050 border border-charcoal-100 rounded p-3 text-charcoal-700 italic">
                  "{livePost.lyricSource}"
                </div>
              </div>

              {stage === 1 && (
                <div className="border border-charcoal-100 rounded p-4">
                  <div className="font-display text-xs tracking-widest uppercase text-charcoal-400 mb-2">
                    Direction
                  </div>
                  {isEditingDirection ? (
                    <div className="flex flex-col gap-3">
                      <div>
                        <label className="text-xs text-charcoal-500 block mb-1" htmlFor="caption">Caption</label>
                        <textarea
                          id="caption"
                          value={caption}
                          onChange={e => setCaption(e.target.value)}
                          rows={4}
                          maxLength={2200}
                          className="w-full border border-charcoal-200 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-brand"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-charcoal-500 block mb-1" htmlFor="hashtags">Hashtags</label>
                        <input
                          id="hashtags"
                          value={hashtags}
                          onChange={e => setHashtags(e.target.value)}
                          className="w-full border border-charcoal-200 rounded px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-charcoal-500 block mb-1" htmlFor="directionBrief">Creative Brief</label>
                        <textarea
                          id="directionBrief"
                          value={directionBrief}
                          onChange={e => setDirectionBrief(e.target.value)}
                          rows={3}
                          className="w-full border border-charcoal-200 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-brand"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => acceptDirectionMutation.mutate(true)} disabled={acceptDirectionMutation.isPending}>
                          {acceptDirectionMutation.isPending ? 'Saving…' : 'Save & Accept'}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setIsEditingDirection(false)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <p className="text-sm text-charcoal-800">{caption}</p>
                      <p className="text-xs text-charcoal-500">{hashtags}</p>
                      <p className="text-sm text-charcoal-700">{directionBrief}</p>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => acceptDirectionMutation.mutate(false)} disabled={acceptDirectionMutation.isPending}>
                          Accept
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setIsEditingDirection(true)}>Edit</Button>
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-charcoal-400 mt-3">Accepting approves this direction to be sent to the editor agent.</p>
                </div>
              )}

              {stage === 2 && (
                <div className="border border-charcoal-100 rounded p-4 bg-charcoal-050">
                  <div className="font-display text-xs tracking-widest uppercase text-charcoal-400 mb-2">
                    Direction (accepted)
                  </div>
                  <div className="text-sm text-charcoal-800 whitespace-pre-wrap mb-3">{livePost.directionBrief}</div>
                  {isEditorPending ? (
                    <div className="flex items-center gap-2 text-sm text-indigo-600">
                      <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                      Editor agent is working…
                    </div>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        onClick={() => sendToEditorMutation.mutate()}
                        disabled={sendToEditorMutation.isPending || !hasVerifiedAssets}
                      >
                        {sendToEditorMutation.isPending ? 'Sending…' : 'Send to Editor Agent →'}
                      </Button>
                      <p className="text-xs text-charcoal-400 mt-2">A successful result is automatically approved for push.</p>
                      {!assetsLoading && !hasVerifiedAssets && (
                        <p className="text-xs text-danger mt-2">{noAssetsMessage}</p>
                      )}
                    </>
                  )}
                </div>
              )}

              {stage !== 1 && (
                <>
                  <div>
                    <label className="font-display text-xs tracking-widest uppercase text-charcoal-400 block mb-1" htmlFor="caption">
                      Caption
                    </label>
                    <textarea
                      id="caption"
                      value={caption}
                      onChange={e => setCaption(e.target.value)}
                      rows={6}
                      maxLength={2200}
                      className="w-full border border-charcoal-200 rounded px-3 py-2.5 text-sm text-charcoal-900 resize-none focus:outline-none focus:border-brand"
                    />
                    <div className="text-right text-xs text-charcoal-400 mt-1">{caption.length}/2200</div>
                  </div>

                  <div>
                    <label className="font-display text-xs tracking-widest uppercase text-charcoal-400 block mb-1" htmlFor="hashtags">
                      Hashtags
                    </label>
                    <input
                      id="hashtags"
                      value={hashtags}
                      onChange={e => setHashtags(e.target.value)}
                      className="w-full border border-charcoal-200 rounded px-3 py-2.5 text-sm"
                      placeholder="#indiemusic, #newrelease"
                    />
                  </div>

                  <Button size="sm" variant="secondary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? 'Saving…' : 'Save Changes'}
                  </Button>
                </>
              )}

              <div className="font-mono text-xs text-charcoal-400">
                Scheduled: {new Date(livePost.scheduledAt).toLocaleString()}
              </div>

              {livePost.bufferId && (
                <div className="flex items-center gap-2 text-sm text-success font-medium">
                  <span className="w-2 h-2 rounded-full bg-success" />
                  Pushed · Buffer ID: <span className="font-mono text-xs">{livePost.bufferId}</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-charcoal-100 flex items-center gap-3 shrink-0">
              <Button variant="ghost" onClick={onClose} size="sm">Close</Button>

              {stage === 3 && (
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <input
                      value={feedback}
                      onChange={e => setFeedback(e.target.value)}
                      placeholder="Feedback for regenerate (optional)"
                      className="flex-1 min-w-0 border border-charcoal-200 rounded px-3 py-2 text-xs"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => regenerateMutation.mutate()}
                      disabled={regenerateMutation.isPending || !hasVerifiedAssets}
                    >
                      {regenerateMutation.isPending ? 'Regenerating…' : 'Regenerate ↺'}
                    </Button>
                  </div>
                  {!assetsLoading && !hasVerifiedAssets && (
                    <p className="text-xs text-danger">{noAssetsMessage}</p>
                  )}
                </div>
              )}

              {stage === 3 && livePost.pushError && (
                <p className="text-xs text-danger">Last push failed: {livePost.pushError}</p>
              )}

              <div className="ml-auto flex items-center gap-3 shrink-0">
                {isApproved ? (
                  <span className="text-sm font-medium text-success flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-success" />
                    Approved ✓
                  </span>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => approveMutation.mutate()}
                    disabled={approveMutation.isPending || livePost.editorStatus !== 'READY'}
                  >
                    {approveMutation.isPending ? 'Approving...' : 'Approve'}
                  </Button>
                )}

                {!livePost.bufferId && (
                  <Button
                    onClick={() => pushMutation.mutate()}
                    disabled={pushMutation.isPending || !isApproved}
                    size="sm"
                  >
                    {pushMutation.isPending ? 'Pushing...' : 'Push →'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
