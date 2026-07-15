import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { Button } from '../ui/Button.js'
import { PlatformPreview } from './PlatformPreview.js'
import { api, type DriveFile } from '../../lib/api.js'

interface Props {
  post: any
  campaignId: string
  onClose: () => void
}

const MIME_ICONS: [string, string][] = [
  ['video/', '🎬'],
  ['image/', '🖼'],
]
function mimeIcon(mimeType: string) {
  for (const [prefix, icon] of MIME_ICONS) {
    if (mimeType.startsWith(prefix)) return icon
  }
  return '📄'
}

const VIDEO_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDING:    { label: 'Queued',     color: 'text-amber-500' },
  PROCESSING: { label: 'Rendering…', color: 'text-indigo-500' },
  READY:      { label: 'Ready',      color: 'text-success' },
  FAILED:     { label: 'Failed',     color: 'text-danger' },
}

function defaultPrompt(post: any): string {
  const note = post.assetNote?.trim()
  const captionSnippet = post.caption.replace(/[^\w\s,.!?]/g, '').slice(0, 80)
  return note
    ? `${note}. Cinematic atmospheric motion.`
    : `Cinematic atmospheric animation. ${captionSnippet}`
}

export function PostEditor({ post: initialPost, campaignId, onClose }: Props) {
  const qc = useQueryClient()

  // Live post — starts from prop, updated by the poll query
  const [livePost, setLivePost] = useState<any>(initialPost)
  const [caption, setCaption] = useState<string>(initialPost.caption)
  const [hashtags, setHashtags] = useState<string>(initialPost.hashtags.join(', '))
  const [assetFileId, setAssetFileId] = useState<string | null>(initialPost.assetFileId ?? null)
  const [assetMimeType, setAssetMimeType] = useState<string | null>(initialPost.assetMimeType ?? null)
  const [motionPrompt, setMotionPrompt] = useState<string>(defaultPrompt(initialPost))

  const isVideoInFlight = livePost.videoStatus === 'PENDING' || livePost.videoStatus === 'PROCESSING'

  // Poll this post every 3s while video is generating
  const { data: polledPost } = useQuery({
    queryKey: ['post', campaignId, initialPost.id],
    queryFn: () => api.getPost(campaignId, initialPost.id),
    refetchInterval: isVideoInFlight ? 3000 : false,
    enabled: isVideoInFlight,
  })
  useEffect(() => {
    if (polledPost) setLivePost(polledPost)
  }, [polledPost])

  const { data: assets = [], isLoading: assetsLoading, error: assetsError } = useQuery<DriveFile[]>({
    queryKey: ['assets', campaignId],
    queryFn: () => api.getAssets(campaignId),
    retry: 1,
  })

  const saveMutation = useMutation({
    mutationFn: () =>
      api.updatePost(campaignId, initialPost.id, {
        caption,
        hashtags: hashtags.split(',').map((h: string) => h.trim()).filter(Boolean),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['posts', campaignId] })
      onClose()
    },
  })

  const selectAssetMutation = useMutation({
    mutationFn: (file: DriveFile) =>
      api.updatePost(campaignId, initialPost.id, { assetFileId: file.id, assetMimeType: file.mimeType }),
    onSuccess: (_data, file) => {
      setAssetFileId(file.id)
      setAssetMimeType(file.mimeType)
      qc.invalidateQueries({ queryKey: ['posts', campaignId] })
    },
  })

  const generateVideoMutation = useMutation({
    mutationFn: () => api.generatePostVideo(campaignId, initialPost.id, motionPrompt),
    onSuccess: (updated) => {
      setLivePost(updated)
      qc.invalidateQueries({ queryKey: ['posts', campaignId] })
    },
    onError: (e: Error) => alert(`Video generation failed: ${e.message}`),
  })

  const approveMutation = useMutation({
    mutationFn: () => api.approvePost(campaignId, initialPost.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['posts', campaignId] }),
    onError: (e: Error) => alert(`Approval failed: ${e.message}`),
  })

  const pushMutation = useMutation({
    mutationFn: () => api.pushPost(campaignId, initialPost.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['posts', campaignId] })
      onClose()
    },
  })

  const isApproved = approveMutation.isSuccess || livePost.approved

  // Preview: Higgsfield video wins; else show selected asset
  const previewVideoUrl = livePost.videoUrl ?? null
  const previewAssetFileId = previewVideoUrl ? null : assetFileId
  const previewAssetMimeType = previewVideoUrl ? null : assetMimeType

  const canGenerateVideo = !!assetFileId && assetMimeType?.startsWith('image/')
  const videoStatus = livePost.videoStatus as string | null
  const statusInfo = videoStatus ? VIDEO_STATUS_LABELS[videoStatus] : null

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

          {/* Left: preview + asset picker + video generation */}
          <div className="w-80 border-r border-charcoal-100 flex flex-col overflow-y-auto bg-charcoal-050 shrink-0">
            <div className="flex items-start justify-center py-6 px-4">
              <PlatformPreview
                platform={livePost.platform}
                caption={caption}
                hashtags={hashtags.split(',').map((h: string) => h.trim()).filter(Boolean)}
                scheduledAt={livePost.scheduledAt}
                videoUrl={previewVideoUrl}
                assetFileId={previewAssetFileId}
                assetMimeType={previewAssetMimeType}
              />
            </div>

            {/* Asset picker */}
            <div className="px-4 pb-4">
              <div className="font-display text-xs tracking-widest uppercase text-charcoal-400 mb-2">
                Image Asset
              </div>
              {assetsLoading ? (
                <div className="flex items-center gap-2 text-xs text-charcoal-400 py-1">
                  <span className="w-3 h-3 border border-charcoal-300 border-t-transparent rounded-full animate-spin" />
                  Loading assets…
                </div>
              ) : assetsError ? (
                <p className="text-xs text-danger">
                  Could not load assets: {(assetsError as Error).message}
                  {(assetsError as Error).message?.includes('token') && (
                    <span className="block mt-1 text-charcoal-400">Try signing out and back in with Google.</span>
                  )}
                </p>
              ) : assets.length === 0 ? (
                <p className="text-xs text-charcoal-400">
                  No assets folder — add a Google Drive folder URL in campaign settings.
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  {(assets as DriveFile[]).filter(f => f.mimeType.startsWith('image/')).map((file) => {
                    const isSelected = file.id === assetFileId
                    return (
                      <button
                        key={file.id}
                        onClick={() => selectAssetMutation.mutate(file)}
                        disabled={selectAssetMutation.isPending}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left w-full transition-colors ${
                          isSelected
                            ? 'bg-indigo-50 border border-indigo-300 text-indigo-800'
                            : 'bg-white border border-charcoal-100 text-charcoal-700 hover:border-charcoal-300'
                        }`}
                      >
                        <span className="text-sm shrink-0">{mimeIcon(file.mimeType)}</span>
                        <span className="truncate">{file.name}</span>
                        {isSelected && <span className="ml-auto shrink-0 text-indigo-500">✓</span>}
                      </button>
                    )
                  })}
                  {assets.filter(f => f.mimeType.startsWith('image/')).length === 0 && (
                    <p className="text-xs text-charcoal-400">No image files found in this folder.</p>
                  )}
                </div>
              )}
            </div>

            {/* Video generation */}
            <div className="px-4 pb-6 border-t border-charcoal-100 pt-4">
              <div className="flex items-center justify-between mb-2">
                <div className="font-display text-xs tracking-widest uppercase text-charcoal-400">
                  Video
                </div>
                {statusInfo && (
                  <div className={`flex items-center gap-1.5 text-xs font-medium ${statusInfo.color}`}>
                    {isVideoInFlight && (
                      <span className="w-2 h-2 rounded-full border border-current border-t-transparent animate-spin inline-block" />
                    )}
                    {statusInfo.label}
                  </div>
                )}
              </div>

              {!canGenerateVideo && (
                <p className="text-xs text-charcoal-400 mb-3">
                  Select an image asset above to enable video generation.
                </p>
              )}

              <div className="flex flex-col gap-2">
                <label className="text-xs text-charcoal-500">Motion direction</label>
                <textarea
                  value={motionPrompt}
                  onChange={e => setMotionPrompt(e.target.value)}
                  disabled={!canGenerateVideo || isVideoInFlight}
                  rows={4}
                  placeholder="Describe the motion — slow zoom, parallax drift, atmospheric haze, energy level, color tone…"
                  className="w-full border border-charcoal-200 rounded px-2.5 py-2 text-xs text-charcoal-700 resize-none focus:outline-none focus:border-brand disabled:opacity-40 disabled:bg-charcoal-050"
                />
                <Button
                  size="sm"
                  variant={videoStatus === 'READY' ? 'secondary' : 'primary'}
                  onClick={() => generateVideoMutation.mutate()}
                  disabled={!canGenerateVideo || isVideoInFlight || generateVideoMutation.isPending}
                  className="w-full"
                >
                  {isVideoInFlight
                    ? 'Generating…'
                    : videoStatus === 'READY'
                      ? 'Regenerate ↺'
                      : videoStatus === 'FAILED'
                        ? 'Retry →'
                        : 'Generate Video →'}
                </Button>
                {videoStatus === 'FAILED' && (
                  <p className="text-xs text-danger">Generation failed — adjust the prompt and retry.</p>
                )}
              </div>
            </div>
          </div>

          {/* Right: text editor + actions */}
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

              <div>
                <label
                  className="font-display text-xs tracking-widest uppercase text-charcoal-400 block mb-1"
                  htmlFor="caption"
                >
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
                <label
                  className="font-display text-xs tracking-widest uppercase text-charcoal-400 block mb-1"
                  htmlFor="hashtags"
                >
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

              <div>
                <div className="font-display text-xs tracking-widest uppercase text-charcoal-400 mb-1">
                  Asset Note
                </div>
                <div className="text-sm text-charcoal-600 bg-charcoal-050 rounded p-3">{livePost.assetNote}</div>
              </div>

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
              <Button variant="ghost" onClick={onClose} size="sm">Cancel</Button>
              <Button
                variant="secondary"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                size="sm"
              >
                Save Changes
              </Button>

              <div className="ml-auto flex items-center gap-3">
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
                    disabled={approveMutation.isPending}
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
