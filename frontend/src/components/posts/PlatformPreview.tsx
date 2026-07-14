import React from 'react'

interface PlatformPreviewProps {
  platform: 'TIKTOK' | 'INSTAGRAM' | 'YOUTUBE' | 'FACEBOOK'
  caption: string
  hashtags: string[]
  scheduledAt: string
  videoUrl?: string | null
  assetFileId?: string | null
  assetMimeType?: string | null
}

const CHAR_LIMIT = 150

function truncate(text: string, limit = CHAR_LIMIT) {
  return text.length > limit ? text.slice(0, limit) + '…' : text
}

function formatHashtags(tags: string[]) {
  return tags.map(h => (h.startsWith('#') ? h : `#${h}`)).join(' ')
}

interface MediaSlotProps {
  videoUrl?: string | null
  assetFileId?: string | null
  assetMimeType?: string | null
  className: string
  placeholderClassName: string
  style?: React.CSSProperties
}

function MediaSlot({ videoUrl, assetFileId, assetMimeType, className, placeholderClassName, style }: MediaSlotProps) {
  const src = videoUrl ?? (assetFileId ? `/api/drive/asset/${assetFileId}` : null)
  const isVideo = videoUrl != null || (assetMimeType?.startsWith('video/') ?? false)

  if (src && isVideo) {
    return (
      <video
        src={src}
        className={className}
        style={{ objectFit: 'cover', ...style }}
        autoPlay
        muted
        loop
        playsInline
      />
    )
  }
  if (src && !isVideo) {
    return (
      <img
        src={src}
        className={className}
        style={{ objectFit: 'cover', ...style }}
        alt="post asset"
      />
    )
  }
  return (
    <div className={placeholderClassName} style={style}>
      <span className="opacity-20 text-4xl">🎵</span>
    </div>
  )
}

function PhoneFrame({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <div
      className={`relative w-[272px] rounded-[2rem] border-4 shadow-xl overflow-hidden flex flex-col ${
        dark ? 'border-charcoal-900 bg-black' : 'border-charcoal-200 bg-white'
      }`}
      style={{ height: '482px' }}
    >
      <div className={`h-6 flex items-center justify-center shrink-0 ${dark ? 'bg-black' : 'bg-white'}`}>
        <div className="w-14 h-3 bg-charcoal-900 rounded-full opacity-70" />
      </div>
      <div className="flex-1 overflow-hidden relative">{children}</div>
    </div>
  )
}

interface PreviewProps {
  caption: string
  hashtags: string[]
  videoUrl?: string | null
  assetFileId?: string | null
  assetMimeType?: string | null
}

function InstagramPreview({ caption, hashtags, videoUrl, assetFileId, assetMimeType }: PreviewProps) {
  const hashtagStr = formatHashtags(hashtags)
  return (
    <PhoneFrame>
      <div className="flex items-center justify-between px-3 py-2 border-b border-charcoal-100 bg-white">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#f09433] via-[#e6683c] to-[#bc1888]" />
          <span className="text-[11px] font-semibold text-charcoal-900">blueskyfable</span>
        </div>
        <span className="text-charcoal-400 text-sm tracking-widest">···</span>
      </div>
      <MediaSlot
        videoUrl={videoUrl}
        assetFileId={assetFileId}
        assetMimeType={assetMimeType}
        className="w-full"
        placeholderClassName="w-full bg-gradient-to-br from-indigo-400 via-purple-400 to-pink-400 flex items-center justify-center"
        style={{ height: '272px' }}
      />
      <div className="px-3 py-1.5 flex gap-3 text-base bg-white">
        <span>♥</span><span>💬</span><span>✈</span>
        <span className="ml-auto">🔖</span>
      </div>
      <div className="px-3 pb-2 text-[11px] text-charcoal-700 bg-white overflow-hidden">
        <span className="font-semibold">blueskyfable </span>
        <span>{truncate(caption, 80)}</span>
        {caption.length > 80 && <span className="text-charcoal-400"> …more</span>}
        {hashtagStr && (
          <div className="text-[#00376b] mt-0.5 text-[10px]">{truncate(hashtagStr, 60)}</div>
        )}
      </div>
    </PhoneFrame>
  )
}

function TikTokPreview({ caption, hashtags, videoUrl, assetFileId, assetMimeType }: PreviewProps) {
  const hashtagStr = formatHashtags(hashtags)
  return (
    <PhoneFrame dark>
      <div className="absolute inset-0">
        <MediaSlot
          videoUrl={videoUrl}
          assetFileId={assetFileId}
          assetMimeType={assetMimeType}
          className="w-full h-full"
          placeholderClassName="w-full h-full bg-gradient-to-b from-charcoal-800 via-charcoal-900 to-black flex items-center justify-center"
        />
      </div>
      <div className="absolute right-2 bottom-20 flex flex-col gap-4 items-center text-white text-[10px]">
        <div className="flex flex-col items-center gap-0.5">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-400 border-2 border-white" />
          <span className="text-[9px] bg-[#fe2c55] rounded-full w-4 h-4 flex items-center justify-center font-bold">+</span>
        </div>
        <div className="flex flex-col items-center"><span className="text-xl">♥</span><span>12.4k</span></div>
        <div className="flex flex-col items-center"><span className="text-xl">💬</span><span>345</span></div>
        <div className="flex flex-col items-center"><span className="text-xl">↗</span><span>1.2k</span></div>
      </div>
      <div className="absolute bottom-3 left-3 right-12 text-white">
        <div className="text-[11px] font-bold mb-0.5">@blueskyfable</div>
        <div className="text-[10px] leading-snug">{truncate(caption, 90)}</div>
        {hashtagStr && (
          <div className="text-[9px] text-blue-300 mt-0.5">{truncate(hashtagStr, 55)}</div>
        )}
        <div className="text-[9px] mt-1 opacity-60">♫ Original Sound · Blue Sky Fable</div>
      </div>
    </PhoneFrame>
  )
}

function FacebookPreview({ caption, hashtags, videoUrl, assetFileId, assetMimeType }: PreviewProps) {
  const hashtagStr = formatHashtags(hashtags)
  return (
    <div className="w-[272px] bg-white border border-charcoal-200 rounded-lg shadow-md overflow-hidden">
      <div className="px-3 py-2 flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-400 shrink-0" />
        <div>
          <div className="text-[11px] font-semibold text-charcoal-900">Blue Sky Fable</div>
          <div className="text-[9px] text-charcoal-400">Just now · 🌐</div>
        </div>
      </div>
      <div className="px-3 pb-2 text-[11px] text-charcoal-800">
        {truncate(caption, 180)}
        {hashtagStr && (
          <span className="text-[#1877f2] ml-1 text-[10px]">{truncate(hashtagStr, 50)}</span>
        )}
      </div>
      <MediaSlot
        videoUrl={videoUrl}
        assetFileId={assetFileId}
        assetMimeType={assetMimeType}
        className="w-full"
        placeholderClassName="w-full h-32 bg-gradient-to-br from-indigo-400 via-purple-400 to-pink-400 flex items-center justify-center"
        style={{ height: '128px' }}
      />
      <div className="px-3 py-2 flex gap-4 border-t border-charcoal-100 text-[11px] text-charcoal-500">
        <span>👍 Like</span><span>💬 Comment</span><span>↗ Share</span>
      </div>
    </div>
  )
}

function YouTubePreview({ caption, videoUrl, assetFileId, assetMimeType }: { caption: string; videoUrl?: string | null; assetFileId?: string | null; assetMimeType?: string | null }) {
  const hasMedia = videoUrl != null || (assetFileId != null && assetMimeType != null)
  const src = videoUrl ?? (assetFileId ? `/api/drive/asset/${assetFileId}` : null)
  const isVideo = videoUrl != null || (assetMimeType?.startsWith('video/') ?? false)
  return (
    <div className="w-[272px] bg-white rounded-lg shadow-md overflow-hidden">
      <div className="relative w-full aspect-video overflow-hidden bg-gradient-to-br from-charcoal-700 to-charcoal-900">
        {src && isVideo ? (
          <video src={src} className="w-full h-full object-cover" autoPlay muted loop playsInline />
        ) : src && !isVideo ? (
          <img src={src} className="w-full h-full object-cover" alt="thumbnail" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-4xl opacity-10">🎵</span>
          </div>
        )}
        {!hasMedia && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-10 h-10 bg-red-600 rounded-full flex items-center justify-center shadow-lg opacity-90">
              <span className="text-white text-base ml-0.5">▶</span>
            </div>
          </div>
        )}
      </div>
      <div className="p-2 flex gap-2">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-purple-400 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-charcoal-900 leading-snug line-clamp-2">
            {truncate(caption, 70)}
          </div>
          <div className="text-[10px] text-charcoal-400 mt-0.5">Blue Sky Fable · Just now</div>
        </div>
      </div>
    </div>
  )
}

export function PlatformPreview({ platform, caption, hashtags, scheduledAt, videoUrl, assetFileId, assetMimeType }: PlatformPreviewProps) {
  const dateStr = new Date(scheduledAt).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
  const mediaProps = { videoUrl, assetFileId, assetMimeType }
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="font-display text-xs tracking-widest uppercase text-charcoal-400">
        {platform} Preview
      </div>
      {platform === 'INSTAGRAM' && <InstagramPreview caption={caption} hashtags={hashtags} {...mediaProps} />}
      {platform === 'TIKTOK' && <TikTokPreview caption={caption} hashtags={hashtags} {...mediaProps} />}
      {platform === 'FACEBOOK' && <FacebookPreview caption={caption} hashtags={hashtags} {...mediaProps} />}
      {platform === 'YOUTUBE' && <YouTubePreview caption={caption} {...mediaProps} />}
      <div className="text-[10px] text-charcoal-400 font-mono">Sched: {dateStr}</div>
    </div>
  )
}
