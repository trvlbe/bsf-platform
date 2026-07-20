# Buffer API Migration + Video Attachment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `pushPost` off Buffer's deprecated legacy REST API onto Buffer's current GraphQL API, attach the generated video, and set the per-platform metadata Buffer actually requires (today it only ever sends bare caption text with no metadata at all).

**Architecture:** Rename the Buffer credential fields on `User`; `Post` gets two new columns (`pushError`, `youtubeTitlePhrase`). The content agent starts generating a short YouTube-title phrase alongside its existing output. `backend/src/lib/buffer.ts`'s `pushPost` is rewritten to call `https://api.buffer.com`'s `createPost` mutation with Bearer auth, a video asset when `post.videoUrl` is set, and per-platform `metadata` (YouTube needs `title`+`categoryId`, Instagram/Facebook need `type`, all three non-Facebook platforms get an honest `isAiGenerated: true`). The two call sites (`push.ts`, the single-post push route) get updated field names, compute each post's campaign-wide sequence number, and start persisting `pushError` instead of silently swallowing failures. The frontend surfaces `pushError` next to the Push button.

**Tech Stack:** Node.js 20 ESM, TypeScript 5 strict, Express 5, Prisma 6, PostgreSQL 16, Vitest, React 19, TanStack Query v5.

**Spec:** `docs/superpowers/specs/2026-07-19-buffer-api-migration-design.md`

## Global Constraints

- ESM throughout — all relative TypeScript imports use `.js` extension even in `.ts` source files.
- TypeScript strict mode — no new `any`, no `@ts-ignore`.
- Backend `.env` `DATABASE_URL` already targets `postgresql://bsf:bsf_dev@localhost:5433/bsf_platform` — migrations run against that directly.
- Given this repo's recurring dev-DB drift history, if `npx prisma migrate dev` reports drift, do NOT run `migrate reset` or any data-destructive command — hand-write the migration SQL, apply it directly (`docker exec bsf-platform-postgres-1 psql -U bsf -d bsf_platform -c '...'`), then `npx prisma migrate resolve --applied <name>`, then `npx prisma generate`.
- Run backend tests with `cd backend && npx vitest run`; frontend tests with `cd frontend && npx vitest run`.
- Every Buffer API response returns HTTP 200 regardless of success or failure — never gate on `res.ok`/`res.status` for this API; always parse the JSON body.
- No auto-fetch-channel-ID UI — channel IDs stay manual-paste, per the spec's scope decision.
- The field is `lyricSource` throughout this codebase today (not `anchorQuote` — that's a separate, not-yet-implemented rename from an unrelated spec). Use `lyricSource` in every task below.
- `PostType` (Buffer's GraphQL enum for Instagram/Facebook `type`) uses lowercase values (`reel`, `post`, `story`, etc.) — confirmed against Buffer's live schema reference.

---

### Task 1: Add `Post.pushError` and `Post.youtubeTitlePhrase`, rename Buffer credential fields

**Files:**
- Modify: `backend/prisma/schema.prisma:49-53` (User model), `backend/prisma/schema.prisma` (Post model, add two new fields)
- Create: `backend/prisma/migrations/<timestamp>_rename_buffer_channels_add_push_fields/migration.sql`

**Interfaces:**
- Produces: `User.bufferChannelTiktok/Instagram/Youtube/Facebook: string | null`, `Post.pushError: string | null`, `Post.youtubeTitlePhrase: string | null` (Prisma Client fields), consumed by Tasks 2, 3, and 4.

- [ ] **Step 1: Update the schema**

In `backend/prisma/schema.prisma`, change these lines in `model User`:

```prisma
  bufferAccessToken      String?
  bufferChannelTiktok    String?
  bufferChannelInstagram String?
  bufferChannelYoutube   String?
  bufferChannelFacebook  String?
```

(only the 4 `bufferProfile*` lines are renamed to `bufferChannel*` — `bufferAccessToken` is unchanged.)

In `model Post`, add both new fields right after `bufferId`:

```prisma
  bufferId    String?
  pushError   String?
  youtubeTitlePhrase String?
```

- [ ] **Step 2: Generate and apply the migration**

Run from `backend/`:

```bash
npx prisma migrate dev --name rename_buffer_channels_add_push_fields
```

Expected: either it succeeds directly (`Your database is now in sync with your schema.`), or it reports drift — if drift, follow the Global Constraints' non-destructive procedure: hand-write `backend/prisma/migrations/<timestamp>_rename_buffer_channels_add_push_fields/migration.sql` with:

```sql
ALTER TABLE "User" RENAME COLUMN "bufferProfileTiktok" TO "bufferChannelTiktok";
ALTER TABLE "User" RENAME COLUMN "bufferProfileInstagram" TO "bufferChannelInstagram";
ALTER TABLE "User" RENAME COLUMN "bufferProfileYoutube" TO "bufferChannelYoutube";
ALTER TABLE "User" RENAME COLUMN "bufferProfileFacebook" TO "bufferChannelFacebook";
ALTER TABLE "Post" ADD COLUMN "pushError" TEXT;
ALTER TABLE "Post" ADD COLUMN "youtubeTitlePhrase" TEXT;
```

then apply it directly:

```bash
docker exec bsf-platform-postgres-1 psql -U bsf -d bsf_platform -f - <<'EOF'
ALTER TABLE "User" RENAME COLUMN "bufferProfileTiktok" TO "bufferChannelTiktok";
ALTER TABLE "User" RENAME COLUMN "bufferProfileInstagram" TO "bufferChannelInstagram";
ALTER TABLE "User" RENAME COLUMN "bufferProfileYoutube" TO "bufferChannelYoutube";
ALTER TABLE "User" RENAME COLUMN "bufferProfileFacebook" TO "bufferChannelFacebook";
ALTER TABLE "Post" ADD COLUMN "pushError" TEXT;
ALTER TABLE "Post" ADD COLUMN "youtubeTitlePhrase" TEXT;
EOF
```

then mark it resolved and regenerate the client:

```bash
npx prisma migrate resolve --applied rename_buffer_channels_add_push_fields
npx prisma generate
```

- [ ] **Step 3: Verify existing tests still pass**

```bash
cd backend && npx vitest run
```

Expected: pre-existing tests that reference `bufferProfileTiktok` will now fail to compile/run (Task 4 fixes those references) — if `npx vitest run` reports failures only in files this plan's later tasks touch (`campaigns.ts` call sites, `campaigns.post-approve.test.ts`), that's expected at this point; if anything else fails, stop and investigate before continuing.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat: add Post.pushError/youtubeTitlePhrase, rename Buffer profile fields to channel fields"
```

---

### Task 2: Content agent generates a YouTube title phrase

**Files:**
- Modify: `backend/src/agents/contentAgent.ts` (interface, tool schema, prompt)
- Modify: `backend/src/commands/generate.ts:70-81` (persist the new field)

**Interfaces:**
- Consumes: `Post.youtubeTitlePhrase` column from Task 1.
- Produces: `PostDraft.youtubeTitlePhrase: string`, persisted onto every created `Post` row. Task 3's `buildYoutubeTitle` reads `post.youtubeTitlePhrase` from the database (not from this task directly), so this task just needs to make sure the column gets populated going forward.

- [ ] **Step 1: Update the `PostDraft` interface and tool schema**

In `backend/src/agents/contentAgent.ts`, change the `PostDraft` interface:

```ts
export interface PostDraft {
  platform: string
  caption: string
  hashtags: string[]
  lyricSource: string
  assetNote: string
  youtubeTitlePhrase: string
}
```

Change `SUBMIT_POSTS_TOOL`'s item schema:

```ts
const SUBMIT_POSTS_TOOL: Anthropic.Tool = {
  name: 'submit_posts',
  description: 'Submit the social media posts for this day',
  input_schema: {
    type: 'object' as const,
    properties: {
      posts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            platform: { type: 'string' },
            caption: { type: 'string' },
            hashtags: { type: 'array', items: { type: 'string' } },
            lyricSource: { type: 'string', description: 'Exact lyric line this post is rooted in — verbatim, no paraphrasing' },
            assetNote: { type: 'string', description: 'Specific filename from available assets OR a concrete visual description. If music analysis shows a hook moment, reference it for editing timing.' },
            youtubeTitlePhrase: { type: 'string', description: 'A short (3-6 word) contextual phrase describing this specific post, used to build a YouTube video title. Generate one for every post regardless of platform.' }
          },
          required: ['platform', 'caption', 'hashtags', 'lyricSource', 'assetNote', 'youtubeTitlePhrase']
        }
      }
    },
    required: ['posts']
  }
}
```

- [ ] **Step 2: Update the prompt instruction**

In the same file, change the final instruction line inside the `prompt` template literal from:

```ts
Write one post per platform. Each post MUST include an exact lyric quote in lyricSource. No paraphrasing.`
```

to:

```ts
Write one post per platform. Each post MUST include an exact lyric quote in lyricSource. No paraphrasing. Each post also needs a short 3-6 word youtubeTitlePhrase capturing this specific post's visual/emotional angle (e.g. "golden hour driving", "empty chairs at 2am") — generate one even for non-YouTube platforms.`
```

- [ ] **Step 3: Persist the new field in `generate.ts`**

In `backend/src/commands/generate.ts`, find the `allPosts.push({...})` call (around lines 70-81) and add the new field:

```ts
        allPosts.push({
          campaignId,
          platform: draft.platform as any,
          caption: draft.caption,
          hashtags: draft.hashtags,
          lyricSource: draft.lyricSource,
          assetNote: draft.assetNote,
          directionBrief: draft.assetNote,
          scheduledAt: slot.scheduledAt,
          dayOffset,
          youtubeTitlePhrase: draft.youtubeTitlePhrase,
        })
```

- [ ] **Step 4: Run existing tests and typecheck**

```bash
cd backend && npx vitest run && npm run build
```

Expected: existing `contentAgent`/`generate` tests may need their mocked `runContentAgent`/`submit_posts` fixtures updated to include `youtubeTitlePhrase` — check `backend/src/tests/` and `backend/tests/generate.test.ts` for any mock post-draft objects missing the new required field, and add `youtubeTitlePhrase: 'test phrase'` to each. All tests pass; `tsc` exits 0.

- [ ] **Step 5: Commit**

```bash
git add backend/src/agents/contentAgent.ts backend/src/commands/generate.ts
git commit -m "feat: generate a YouTube title phrase alongside each post draft"
```

(If Step 4 required fixture updates in test files, include those files in this commit too.)

---

### Task 3: Rewrite `pushPost` for Buffer's GraphQL API + per-platform metadata

**Files:**
- Modify: `backend/src/lib/buffer.ts` (full rewrite)
- Test: `backend/src/tests/buffer.test.ts` (new file)

**Interfaces:**
- Consumes: `Post.videoUrl`, `Post.scheduledAt`, `Post.platform`, `Post.caption`, `Post.hashtags`, `Post.youtubeTitlePhrase` (existing/Task-1 Prisma `Post` type).
- Produces: `pushPost(post: Post, apiKey: string, channelIds: Record<string, string>, campaignTitle: string, sequenceNumber: number): Promise<string>` and `buildYoutubeTitle(campaignTitle: string, sequenceNumber: number, phrase: string | null): string` (exported, tested directly). Task 4 calls `pushPost` with all 5 arguments and computes `sequenceNumber` before calling it.

- [ ] **Step 1: Write the failing tests**

Create `backend/src/tests/buffer.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { pushPost, buildYoutubeTitle } = await import('../lib/buffer.js')

const basePost = {
  id: 'post-1',
  platform: 'TIKTOK',
  caption: 'Test caption',
  hashtags: ['#music', '#newrelease'],
  scheduledAt: new Date('2026-10-01T18:00:00.000Z'),
  videoUrl: null as string | null,
  youtubeTitlePhrase: null as string | null,
} as any

function mockSuccess() {
  return vi.fn().mockResolvedValue({
    json: async () => ({ data: { createPost: { post: { id: 'buffer-post-123' } } } }),
  })
}

beforeEach(() => vi.unstubAllGlobals())

describe('buildYoutubeTitle', () => {
  it('composes title with campaign, sequence, and phrase', () => {
    expect(buildYoutubeTitle('Think About Us', 47, 'golden hour driving'))
      .toBe('Think About Us #47: golden hour driving')
  })

  it('falls back to just campaign and sequence when phrase is null', () => {
    expect(buildYoutubeTitle('Think About Us', 47, null))
      .toBe('Think About Us #47')
  })

  it('truncates to 100 characters when the composed string is too long', () => {
    const longPhrase = 'a'.repeat(120)
    const result = buildYoutubeTitle('Think About Us', 1, longPhrase)
    expect(result.length).toBe(100)
    expect(result.endsWith('…')).toBe(true)
  })
})

describe('pushPost', () => {
  it('resolves with the post id on success', async () => {
    vi.stubGlobal('fetch', mockSuccess())

    const result = await pushPost(basePost, 'test-api-key', { TIKTOK: 'channel-1' }, 'Think About Us', 1)

    expect(result).toBe('buffer-post-123')
  })

  it('throws with the MutationError message when createPost returns one', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({ data: { createPost: { message: 'Invalid channel id' } } }),
    }))

    await expect(pushPost(basePost, 'test-api-key', { TIKTOK: 'channel-1' }, 'Think About Us', 1))
      .rejects.toThrow('Invalid channel id')
  })

  it('throws with the top-level GraphQL error message when present', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({ errors: [{ message: 'Invalid API key' }] }),
    }))

    await expect(pushPost(basePost, 'bad-key', { TIKTOK: 'channel-1' }, 'Think About Us', 1))
      .rejects.toThrow('Invalid API key')
  })

  it('throws when there is no channel id for the post platform', async () => {
    await expect(pushPost(basePost, 'test-api-key', {}, 'Think About Us', 1))
      .rejects.toThrow('No Buffer channel ID for platform TIKTOK')
  })

  it('includes a video asset in the request body when videoUrl is set', async () => {
    const fetchMock = mockSuccess()
    vi.stubGlobal('fetch', fetchMock)

    await pushPost({ ...basePost, videoUrl: 'https://cdn.example/video.mp4' }, 'test-api-key', { TIKTOK: 'channel-1' }, 'Think About Us', 1)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.variables.input.assets).toEqual([{ video: { url: 'https://cdn.example/video.mp4' } }])
  })

  it('omits the assets key entirely when videoUrl is null', async () => {
    const fetchMock = mockSuccess()
    vi.stubGlobal('fetch', fetchMock)

    await pushPost(basePost, 'test-api-key', { TIKTOK: 'channel-1' }, 'Think About Us', 1)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.variables.input.assets).toBeUndefined()
  })

  it('sets YouTube metadata: title, categoryId, isAiGenerated', async () => {
    const fetchMock = mockSuccess()
    vi.stubGlobal('fetch', fetchMock)

    await pushPost({ ...basePost, platform: 'YOUTUBE', youtubeTitlePhrase: 'golden hour driving' }, 'test-api-key', { YOUTUBE: 'channel-2' }, 'Think About Us', 47)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.variables.input.metadata).toEqual({
      youtube: { title: 'Think About Us #47: golden hour driving', categoryId: '10', isAiGenerated: true },
    })
  })

  it('sets Instagram metadata: type reel, isAiGenerated', async () => {
    const fetchMock = mockSuccess()
    vi.stubGlobal('fetch', fetchMock)

    await pushPost({ ...basePost, platform: 'INSTAGRAM' }, 'test-api-key', { INSTAGRAM: 'channel-3' }, 'Think About Us', 1)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.variables.input.metadata).toEqual({ instagram: { type: 'reel', isAiGenerated: true } })
  })

  it('sets Facebook metadata: type reel, no isAiGenerated key', async () => {
    const fetchMock = mockSuccess()
    vi.stubGlobal('fetch', fetchMock)

    await pushPost({ ...basePost, platform: 'FACEBOOK' }, 'test-api-key', { FACEBOOK: 'channel-4' }, 'Think About Us', 1)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.variables.input.metadata).toEqual({ facebook: { type: 'reel' } })
  })

  it('sets TikTok metadata: isAiGenerated only', async () => {
    const fetchMock = mockSuccess()
    vi.stubGlobal('fetch', fetchMock)

    await pushPost(basePost, 'test-api-key', { TIKTOK: 'channel-1' }, 'Think About Us', 1)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.variables.input.metadata).toEqual({ tiktok: { isAiGenerated: true } })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && npx vitest run src/tests/buffer.test.ts
```

Expected: FAIL — `pushPost`/`buildYoutubeTitle` don't exist with this signature yet / the module still calls the legacy REST endpoint.

- [ ] **Step 3: Implement**

Replace the full contents of `backend/src/lib/buffer.ts` with:

```ts
import type { Post } from '@prisma/client'

const BUFFER_API = 'https://api.buffer.com'

const CREATE_POST_MUTATION = `
  mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
      ... on PostActionSuccess {
        post { id }
      }
      ... on MutationError {
        message
      }
    }
  }
`

const YOUTUBE_MUSIC_CATEGORY_ID = '10'
const YOUTUBE_TITLE_LIMIT = 100

export function buildYoutubeTitle(campaignTitle: string, sequenceNumber: number, phrase: string | null): string {
  const base = `${campaignTitle} #${sequenceNumber}`
  const full = phrase ? `${base}: ${phrase}` : base
  return full.length > YOUTUBE_TITLE_LIMIT ? full.slice(0, YOUTUBE_TITLE_LIMIT - 1) + '…' : full
}

function buildMetadata(post: Post, campaignTitle: string, sequenceNumber: number): Record<string, unknown> | undefined {
  switch (post.platform) {
    case 'YOUTUBE':
      return {
        youtube: {
          title: buildYoutubeTitle(campaignTitle, sequenceNumber, post.youtubeTitlePhrase),
          categoryId: YOUTUBE_MUSIC_CATEGORY_ID,
          isAiGenerated: true,
        },
      }
    case 'INSTAGRAM':
      return { instagram: { type: 'reel', isAiGenerated: true } }
    case 'FACEBOOK':
      return { facebook: { type: 'reel' } }
    case 'TIKTOK':
      return { tiktok: { isAiGenerated: true } }
    default:
      return undefined
  }
}

export async function pushPost(
  post: Post,
  apiKey: string,
  channelIds: Record<string, string>,
  campaignTitle: string,
  sequenceNumber: number,
): Promise<string> {
  const channelId = channelIds[post.platform]
  if (!channelId) throw new Error(`No Buffer channel ID for platform ${post.platform}`)

  const text = `${post.caption}\n${post.hashtags.join(' ')}`
  const assets = post.videoUrl ? [{ video: { url: post.videoUrl } }] : undefined
  const metadata = buildMetadata(post, campaignTitle, sequenceNumber)

  const res = await fetch(BUFFER_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: CREATE_POST_MUTATION,
      variables: {
        input: {
          text,
          channelId,
          schedulingType: 'automatic',
          mode: 'customScheduled',
          dueAt: post.scheduledAt.toISOString(),
          ...(assets ? { assets } : {}),
          ...(metadata ? { metadata } : {}),
        },
      },
    }),
  })

  const data = await res.json() as {
    errors?: { message: string }[]
    data?: { createPost?: { message?: string; post?: { id: string } } }
  }

  if (data.errors?.length) throw new Error(data.errors[0].message)
  const result = data.data?.createPost
  if (result?.message) throw new Error(result.message)
  if (!result?.post?.id) throw new Error('Buffer did not return a post id')
  return result.post.id
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npx vitest run src/tests/buffer.test.ts
```

Expected: all 12 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/buffer.ts backend/src/tests/buffer.test.ts
git commit -m "feat: migrate pushPost to Buffer's GraphQL API, attach video + per-platform metadata"
```

---

### Task 4: Update both push call sites — renamed fields, sequence number, `pushError` persistence

**Files:**
- Modify: `backend/src/commands/push.ts` (full rewrite of the credential-resolution + loop body)
- Modify: `backend/src/routes/campaigns.ts:426-470` (the single-post push route)
- Modify: `backend/src/tests/campaigns.post-approve.test.ts:89-90` (env var rename), plus new test additions

**Interfaces:**
- Consumes: `pushPost(post, apiKey, channelIds, campaignTitle, sequenceNumber)` and `buildYoutubeTitle` from Task 3.
- Produces: `pushCampaign(campaignId, userId): Promise<{ pushed: number; skipped: number }>` — return shape unchanged; failure detail now lives on `Post.pushError` instead of being discarded.

- [ ] **Step 1: Write the failing test**

In `backend/src/tests/campaigns.post-approve.test.ts`, change line 90 from:

```ts
  process.env.BUFFER_PROFILE_TIKTOK = 'test-tiktok-profile-id'
```

to:

```ts
  process.env.BUFFER_CHANNEL_TIKTOK = 'test-tiktok-profile-id'
```

Then update the mock at the top of the file (around line 16) — `pushPost` now takes 5 arguments, but a `vi.fn().mockResolvedValue(...)` mock doesn't care about arity, so no change is needed there. Add a new `describe` block after the existing `describe('POST /api/campaigns/:id/push — push guard (approved only)', ...)` block:

```ts
describe('POST /api/campaigns/:id/push — pushError persistence', () => {
  it('clears pushError on a successful push and sets it on a failed one', async () => {
    const { pushPost } = await import('../lib/buffer.js')

    const failingPost = await prisma.post.create({
      data: {
        campaignId: pushCampaignId,
        platform: 'TIKTOK',
        caption: 'Will fail to push',
        hashtags: ['#fail'],
        lyricSource: 'Fail lyric',
        assetNote: 'Fail asset note',
        directionBrief: 'Fail direction brief',
        scheduledAt: new Date('2026-10-06'),
        dayOffset: 5,
        approved: true,
      },
    })

    ;(pushPost as any).mockRejectedValueOnce(new Error('Invalid channel id'))
    await request(app).post(`/api/campaigns/${pushCampaignId}/push`)

    const failed = await prisma.post.findUnique({ where: { id: failingPost.id } })
    expect(failed?.pushError).toBe('Invalid channel id')
    expect(failed?.bufferId).toBeNull()

    ;(pushPost as any).mockResolvedValueOnce('buffer-post-999')
    await request(app).post(`/api/campaigns/${pushCampaignId}/push`)

    const succeeded = await prisma.post.findUnique({ where: { id: failingPost.id } })
    expect(succeeded?.pushError).toBeNull()
    expect(succeeded?.bufferId).toBe('buffer-post-999')

    await prisma.post.delete({ where: { id: failingPost.id } })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx vitest run src/tests/campaigns.post-approve.test.ts
```

Expected: FAIL — nothing writes to `pushError` yet.

- [ ] **Step 3: Implement — `push.ts`**

Replace the full contents of `backend/src/commands/push.ts` with:

```ts
import { prisma } from '../lib/db.js'
import { pushPost } from '../lib/buffer.js'
import { decrypt } from '../lib/encrypt.js'

export async function pushCampaign(campaignId: string, userId: string): Promise<{ pushed: number; skipped: number }> {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, userId } })
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`)

  const user = await prisma.user.findUnique({ where: { id: userId } })

  let apiKey: string | undefined
  try {
    apiKey = user?.bufferAccessToken
      ? decrypt(user.bufferAccessToken)
      : process.env.BUFFER_ACCESS_TOKEN
  } catch {
    throw new Error('Buffer access token is unreadable — please re-save it in Settings')
  }
  if (!apiKey) throw new Error('Buffer access token not configured — add it in Settings')

  const channelMap: Record<string, string | undefined> = {
    TIKTOK: (() => {
      try { return user?.bufferChannelTiktok ? decrypt(user.bufferChannelTiktok) : process.env.BUFFER_CHANNEL_TIKTOK } catch { return process.env.BUFFER_CHANNEL_TIKTOK }
    })(),
    INSTAGRAM: (() => {
      try { return user?.bufferChannelInstagram ? decrypt(user.bufferChannelInstagram) : process.env.BUFFER_CHANNEL_INSTAGRAM } catch { return process.env.BUFFER_CHANNEL_INSTAGRAM }
    })(),
    YOUTUBE: (() => {
      try { return user?.bufferChannelYoutube ? decrypt(user.bufferChannelYoutube) : process.env.BUFFER_CHANNEL_YOUTUBE } catch { return process.env.BUFFER_CHANNEL_YOUTUBE }
    })(),
    FACEBOOK: (() => {
      try { return user?.bufferChannelFacebook ? decrypt(user.bufferChannelFacebook) : process.env.BUFFER_CHANNEL_FACEBOOK } catch { return process.env.BUFFER_CHANNEL_FACEBOOK }
    })(),
  }
  const channelIds: Record<string, string> = {}
  for (const [platform, id] of Object.entries(channelMap)) {
    if (id) channelIds[platform] = id
  }

  const orderedPosts = await prisma.post.findMany({ where: { campaignId }, orderBy: { scheduledAt: 'asc' }, select: { id: true } })
  const posts = await prisma.post.findMany({ where: { campaignId, bufferId: null, approved: true } })
  let pushed = 0, skipped = 0

  for (const post of posts) {
    const sequenceNumber = orderedPosts.findIndex(p => p.id === post.id) + 1
    try {
      const bufferId = await pushPost(post, apiKey, channelIds, campaign.title, sequenceNumber)
      await prisma.post.update({ where: { id: post.id }, data: { bufferId, pushError: null } })
      pushed++
    } catch (err: any) {
      await prisma.post.update({ where: { id: post.id }, data: { pushError: err.message } })
      skipped++
    }
  }

  if (pushed > 0) {
    const total = await prisma.post.count({ where: { campaignId } })
    const totalPushed = await prisma.post.count({ where: { campaignId, bufferId: { not: null } } })
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: totalPushed >= total ? 'COMPLETE' : 'ACTIVE' }
    })
  }

  return { pushed, skipped }
}
```

- [ ] **Step 4: Implement — single-post push route**

In `backend/src/routes/campaigns.ts`, replace lines 426-470 (the whole `campaignsRouter.post('/:id/posts/:postId/push', ...)` handler) with:

```ts
campaignsRouter.post('/:id/posts/:postId/push', async (req, res) => {
  const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id, userId: req.session.userId! } })
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }
  const post = await prisma.post.findFirst({ where: { id: req.params.postId, campaignId: campaign.id } })
  if (!post) { res.status(404).json({ error: 'Post not found' }); return }
  if (!post.approved) { res.status(409).json({ error: 'Post must be approved before pushing' }); return }
  try {
    const user = await prisma.user.findUnique({ where: { id: req.session.userId! } })

    let apiKey: string | undefined
    try {
      apiKey = user?.bufferAccessToken
        ? decrypt(user.bufferAccessToken)
        : process.env.BUFFER_ACCESS_TOKEN
    } catch {
      throw new Error('Buffer access token is unreadable — please re-save it in Settings')
    }
    if (!apiKey) throw new Error('Buffer access token not configured — add it in Settings')

    const channelMap: Record<string, string | undefined> = {
      TIKTOK: (() => {
        try { return user?.bufferChannelTiktok ? decrypt(user.bufferChannelTiktok) : process.env.BUFFER_CHANNEL_TIKTOK } catch { return process.env.BUFFER_CHANNEL_TIKTOK }
      })(),
      INSTAGRAM: (() => {
        try { return user?.bufferChannelInstagram ? decrypt(user.bufferChannelInstagram) : process.env.BUFFER_CHANNEL_INSTAGRAM } catch { return process.env.BUFFER_CHANNEL_INSTAGRAM }
      })(),
      YOUTUBE: (() => {
        try { return user?.bufferChannelYoutube ? decrypt(user.bufferChannelYoutube) : process.env.BUFFER_CHANNEL_YOUTUBE } catch { return process.env.BUFFER_CHANNEL_YOUTUBE }
      })(),
      FACEBOOK: (() => {
        try { return user?.bufferChannelFacebook ? decrypt(user.bufferChannelFacebook) : process.env.BUFFER_CHANNEL_FACEBOOK } catch { return process.env.BUFFER_CHANNEL_FACEBOOK }
      })(),
    }
    const channelIds: Record<string, string> = {}
    for (const [platform, id] of Object.entries(channelMap)) {
      if (id) channelIds[platform] = id
    }

    const orderedPosts = await prisma.post.findMany({ where: { campaignId: campaign.id }, orderBy: { scheduledAt: 'asc' }, select: { id: true } })
    const sequenceNumber = orderedPosts.findIndex(p => p.id === post.id) + 1

    const bufferId = await pushPost(post, apiKey, channelIds, campaign.title, sequenceNumber)
    const updated = await prisma.post.update({ where: { id: post.id }, data: { bufferId, pushError: null } })
    res.json(updated)
  } catch (err: any) {
    await prisma.post.update({ where: { id: post.id }, data: { pushError: err.message } })
    res.status(500).json({ error: 'Push failed', message: err.message })
  }
})
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && npx vitest run src/tests/campaigns.post-approve.test.ts
```

Expected: all tests in the file PASS, including the new `pushError persistence` test.

- [ ] **Step 6: Run the full backend suite and typecheck**

```bash
cd backend && npx vitest run && npm run build
```

Expected: all tests pass; `tsc` exits 0.

- [ ] **Step 7: Commit**

```bash
git add backend/src/commands/push.ts backend/src/routes/campaigns.ts backend/src/tests/campaigns.post-approve.test.ts
git commit -m "feat: persist pushError, compute YouTube sequence number, use renamed Buffer channel fields"
```

---

### Task 5: Settings API + Settings page — rename fields, relabel copy

**Files:**
- Modify: `backend/src/routes/settings.ts:10-30`
- Modify: `frontend/src/lib/api.ts` (the `SettingsResponse` interface)
- Modify: `frontend/src/pages/Settings.tsx:17-23` (the `BUFFER_FIELDS` array)

**Interfaces:**
- Consumes: `User.bufferChannelTiktok/Instagram/Youtube/Facebook` from Task 1.
- Produces: `SettingsResponse` type with `bufferChannelTiktok/Instagram/Youtube/Facebook` fields (was `bufferProfile*`), consumed by `Settings.tsx`.

- [ ] **Step 1: Update the backend settings route**

In `backend/src/routes/settings.ts`, change the `CREDENTIAL_FIELDS` array (lines 10-18):

```ts
const CREDENTIAL_FIELDS = [
  'anthropicApiKey',
  'bufferAccessToken',
  'bufferChannelTiktok',
  'bufferChannelInstagram',
  'bufferChannelYoutube',
  'bufferChannelFacebook',
  'higgsfieldApiKey',
] as const
```

and the `UpdateSettingsSchema` (lines 24-32):

```ts
const UpdateSettingsSchema = z.object({
  anthropicApiKey: credentialString.optional(),
  bufferAccessToken: credentialString.optional(),
  bufferChannelTiktok: credentialString.optional(),
  bufferChannelInstagram: credentialString.optional(),
  bufferChannelYoutube: credentialString.optional(),
  bufferChannelFacebook: credentialString.optional(),
  higgsfieldApiKey: credentialString.optional(),
})
```

- [ ] **Step 2: Update the frontend `SettingsResponse` type**

In `frontend/src/lib/api.ts`, find the `SettingsResponse` interface (around line 47-53). Read the file first to see its exact current full field list (it also includes `higgsfieldApiKey` and possibly others), then rename only the four `bufferProfile*` fields to `bufferChannel*`, keeping every other field exactly as it already is.

- [ ] **Step 3: Update the Settings page labels**

In `frontend/src/pages/Settings.tsx`, change the `BUFFER_FIELDS` array (lines 17-23):

```ts
const BUFFER_FIELDS: FieldConfig[] = [
  { key: 'bufferAccessToken', label: 'Buffer API Key', placeholder: 'Bearer API key from publish.buffer.com/settings/api', required: true },
  { key: 'bufferChannelTiktok', label: 'TikTok Channel ID', placeholder: 'Buffer channel ID', required: false },
  { key: 'bufferChannelInstagram', label: 'Instagram Channel ID', placeholder: 'Buffer channel ID', required: false },
  { key: 'bufferChannelYoutube', label: 'YouTube Channel ID', placeholder: 'Buffer channel ID', required: false },
  { key: 'bufferChannelFacebook', label: 'Facebook Channel ID', placeholder: 'Buffer channel ID', required: false },
]
```

- [ ] **Step 4: Run tests to verify nothing broke**

```bash
cd backend && npx vitest run tests/settings.test.ts
cd ../frontend && npx vitest run
```

Expected: all tests pass (no test in either file references the old `bufferProfile*` names, per prior verification — if any turn up, update them to `bufferChannel*`).

- [ ] **Step 5: Run both builds**

```bash
cd backend && npm run build
cd ../frontend && npm run build
```

Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/settings.ts frontend/src/lib/api.ts frontend/src/pages/Settings.tsx
git commit -m "feat: rename Buffer profile fields to channel fields in Settings"
```

---

### Task 6: Frontend — show `pushError` in PostEditor

**Files:**
- Modify: `frontend/src/components/posts/PostEditor.tsx` (footer section, near the Push button)
- Test: `frontend/src/components/posts/PostEditor.test.tsx`

**Interfaces:**
- Consumes: `livePost.pushError: string | null` (already present on the `post` object returned by `api.pushPost`/`api.getPost` once Task 4 ships; the component treats `post` as `any` today, so no type change needed).

- [ ] **Step 1: Write the failing tests**

In `frontend/src/components/posts/PostEditor.test.tsx`, add these two tests inside `describe('PostEditor — Stage 3: Review', ...)`:

```ts
  it('shows the last push error near the Push button when present', () => {
    render(wrap(<PostEditor post={{ ...STAGE3_READY_POST, approved: true, pushError: 'Invalid channel id' }} campaignId="camp-1" onClose={() => {}} />))
    expect(screen.getByText(/Last push failed: Invalid channel id/)).toBeInTheDocument()
  })

  it('does not show a push error message when pushError is null', () => {
    render(wrap(<PostEditor post={{ ...STAGE3_READY_POST, approved: true, pushError: null }} campaignId="camp-1" onClose={() => {}} />))
    expect(screen.queryByText(/Last push failed/)).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/components/posts/PostEditor.test.tsx
```

Expected: both new tests FAIL (no such text renders yet).

- [ ] **Step 3: Implement**

In `frontend/src/components/posts/PostEditor.tsx`, find the `ml-auto flex items-center gap-3 shrink-0` footer div (containing the Approve/Push buttons) and add the error message immediately before it, inside the same `stage === 3` footer block:

```tsx
              {stage === 3 && livePost.pushError && (
                <p className="text-xs text-danger">Last push failed: {livePost.pushError}</p>
              )}

              <div className="ml-auto flex items-center gap-3 shrink-0">
```

(This sits as a sibling to the existing `{stage === 3 && (<div className="flex flex-col gap-1 flex-1 min-w-0">...regenerate feedback...</div>)}` block and the `ml-auto` div, inside the same footer flex row.)

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/components/posts/PostEditor.test.tsx
```

Expected: all tests in the file PASS, including the 2 new ones.

- [ ] **Step 5: Run the full frontend suite and build**

```bash
cd frontend && npx vitest run && npm run build
```

Expected: all tests pass; build exits 0.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/posts/PostEditor.tsx frontend/src/components/posts/PostEditor.test.tsx
git commit -m "feat: show last push error in PostEditor"
```

---

### Task 7: Update documentation, full verification, docker rebuild

**Files:**
- Modify: `CLAUDE.md:136-140` (Environment Variables section)

- [ ] **Step 1: Update CLAUDE.md's env var documentation**

In `CLAUDE.md`, change:

```
BUFFER_ACCESS_TOKEN=...
BUFFER_PROFILE_TIKTOK=
BUFFER_PROFILE_INSTAGRAM=
BUFFER_PROFILE_YOUTUBE=
BUFFER_PROFILE_FACEBOOK=
```

to:

```
BUFFER_ACCESS_TOKEN=...       # Bearer API key from publish.buffer.com/settings/api
BUFFER_CHANNEL_TIKTOK=
BUFFER_CHANNEL_INSTAGRAM=
BUFFER_CHANNEL_YOUTUBE=
BUFFER_CHANNEL_FACEBOOK=
```

- [ ] **Step 2: Run the full backend and frontend suites**

```bash
cd backend && npx vitest run && npm run build
cd ../frontend && npx vitest run && npm run build
```

Expected: all tests pass in both, both builds exit 0.

- [ ] **Step 3: Rebuild and restart the Docker stack**

From the repo root (`bsf-platform/`):

```bash
docker compose up -d --build
```

Expected: `Container bsf-platform-backend-1 Started` and `Container bsf-platform-frontend-1 Started`.

- [ ] **Step 4: Confirm both services are healthy**

```bash
curl -s http://localhost:4001/health
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5174
```

Expected: `{"status":"ok"}` and `200`.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update Buffer env var names in CLAUDE.md"
```

- [ ] **Step 6: Manual smoke check (not automatable — flag for TJ)**

In Settings, re-save a real Buffer API key (from `publish.buffer.com/settings/api`) and a real channel ID for at least one platform. Approve a post with a generated video and click Push — confirm it either succeeds (check the post appears in Buffer's own dashboard with the video attached and, for YouTube, a real title/category) or shows a clear `pushError` message in the PostEditor if it fails, rather than a silent/opaque failure.
