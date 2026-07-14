import { useState } from 'react'
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

export function PostEditor({ post, campaignId, onClose }: Props) {
  const qc = useQueryClient()
  const [caption, setCaption] = useState<string>(post.caption)
  const [hashtags, setHashtags] = useState<string>(post.hashtags.join(', '))
  const [assetFileId, setAssetFileId] = useState<string | null>(post.assetFileId ?? null)
  const [assetMimeType, setAssetMimeType] = useState<string | null>(post.assetMimeType ?? null)

  const { data: assets = [] } = useQuery<DriveFile[]>({
    queryKey: ['assets', campaignId],
    queryFn: () => api.getAssets(campaignId),
  })

  const saveMutation = useMutation({
    mutationFn: () =>
      api.updatePost(campaignId, post.id, {
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
      api.updatePost(campaignId, post.id, {
        assetFileId: file.id,
        assetMimeType: file.mimeType,
      }),
    onSuccess: (_data, file) => {
      setAssetFileId(file.id)
      setAssetMimeType(file.mimeType)
      qc.invalidateQueries({ queryKey: ['posts', campaignId] })
    },
  })

  const approveMutation = useMutation({
    mutationFn: () => api.approvePost(campaignId, post.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['posts', campaignId] }),
    onError: (e: Error) => alert(`Approval failed: ${e.message}`),
  })

  const pushMutation = useMutation({
    mutationFn: () => api.pushPost(campaignId, post.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['posts', campaignId] })
      onClose()
    },
  })

  const isApproved = approveMutation.isSuccess || post.approved

  const previewHashtags = hashtags
    .split(',')
    .map((h: string) => h.trim())
    .filter(Boolean)

  // Higgsfield video always wins for preview
  const previewVideoUrl = post.videoUrl ?? null
  const previewAssetFileId = previewVideoUrl ? null : assetFileId
  const previewAssetMimeType = previewVideoUrl ? null : assetMimeType

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white w-full max-w-3xl flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-charcoal-100 shrink-0">
          <div>
            <div className="font-display text-xs tracking-widest uppercase text-charcoal-400">
              {post.platform} · Day {post.dayOffset > 0 ? `+${post.dayOffset}` : post.dayOffset}
            </div>
            <h3 className="font-display font-medium text-lg uppercase text-charcoal-900">
              {post.platform} Post
            </h3>
          </div>
          <button onClick={onClose} className="text-charcoal-400 hover:text-charcoal-900 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Two-column body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: preview + asset picker */}
          <div className="w-80 border-r border-charcoal-100 flex flex-col overflow-y-auto bg-charcoal-050 shrink-0">
            <div className="flex items-start justify-center py-6 px-4">
              <PlatformPreview
                platform={post.platform}
                caption={caption}
                hashtags={previewHashtags}
                scheduledAt={post.scheduledAt}
                videoUrl={previewVideoUrl}
                assetFileId={previewAssetFileId}
                assetMimeType={previewAssetMimeType}
              />
            </div>

            {/* Media section */}
            <div className="px-4 pb-6">
              <div className="font-display text-xs tracking-widest uppercase text-charcoal-400 mb-2">
                Media
              </div>

              {post.videoUrl ? (
                <div className="flex items-center gap-2 text-xs font-medium p-2 bg-white rounded border border-charcoal-100 text-charcoal-700">
                  <span className="w-2 h-2 rounded-full bg-success shrink-0" />
                  Video ready
                </div>
              ) : assets.length > 0 ? (
                <div className="flex flex-col gap-1">
                  {assets.map((file: DriveFile) => {
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
                </div>
              ) : (
                <p className="text-xs text-charcoal-400">
                  No assets folder — add a Google Drive folder URL in campaign settings.
                </p>
              )}
            </div>
          </div>

          {/* Right: editor + actions */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-6 flex flex-col gap-5 flex-1 overflow-y-auto">
              <div>
                <div className="font-display text-xs tracking-widest uppercase text-charcoal-400 mb-2">
                  Lyric Source
                </div>
                <div className="font-mono text-sm bg-charcoal-050 border border-charcoal-100 rounded p-3 text-charcoal-700 italic">
                  "{post.lyricSource}"
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
                <div className="text-sm text-charcoal-600 bg-charcoal-050 rounded p-3">{post.assetNote}</div>
              </div>

              <div className="font-mono text-xs text-charcoal-400">
                Scheduled: {new Date(post.scheduledAt).toLocaleString()}
              </div>

              {post.bufferId && (
                <div className="flex items-center gap-2 text-sm text-success font-medium">
                  <span className="w-2 h-2 rounded-full bg-success" />
                  Pushed · Buffer ID:{' '}
                  <span className="font-mono text-xs">{post.bufferId}</span>
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

                {!post.bufferId && (
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
