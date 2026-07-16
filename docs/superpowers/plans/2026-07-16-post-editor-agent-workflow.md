# Post Editor Direction Gate + Editor Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace PostEditor's manual asset-picker/motion-prompt controls with a three-stage pipeline — direction accept/edit gate, a single-decision editor agent that picks one asset and writes the Higgsfield motion prompt, and a review stage that gates Approve on a real finished output.

**Architecture:** `Post` gains `directionBrief`/`directionAccepted`/`editorStatus`/`editorPrompt`/`editorReasoning`. A new `editorAgent.ts` (same pattern as `contentAgent.ts`/`arcAgent.ts`) returns one structured decision that a backend route executes deterministically against the existing Higgsfield integration. `PostEditor.tsx` renders three stages keyed off `directionAccepted`/`editorStatus`.

**Tech Stack:** Node 20 ESM, Express 5, Prisma 6/Postgres, Anthropic SDK (`claude-opus-4-8`, tool use), React 19, TanStack Query v5, Vitest.

## Global Constraints

- ESM throughout — relative TypeScript imports use `.js` extension even in `.ts` source files.
- All Prisma queries scoped to `userId` (via campaign lookup) — 404 on cross-user access, never 403.
- No new abstractions beyond what's specified — reuse `createVideoJob`/`checkJobStatus`/`drivePublicUrl`/`listFolderFiles`/`decrypt` exactly as they exist today.
- Migrations are hand-authored raw SQL in `backend/prisma/migrations/<name>/migration.sql`, following this repo's existing convention (see `20260714000001_post_asset`, `20260713000003_post_approved`).
- Backend tests for new agents/routes go in `backend/src/tests/` (matches `arcAgent.test.ts`'s location there, the current convention for new test files — not the older `backend/tests/` directory).

---

## Task 1: Prisma schema — direction/editor fields + migration

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260716000001_editor_workflow_fields/migration.sql`
- Modify: `backend/src/tests/schema.test.ts`

**Interfaces:**
- Produces: `Post.directionBrief: string`, `Post.directionAccepted: string | null` (ISO datetime, serialized), `Post.editorStatus: 'NOT_STARTED' | 'PENDING' | 'READY' | 'FAILED'`, `Post.editorPrompt: string | null`, `Post.editorReasoning: string | null` — every later task reads/writes these exact field names.

- [ ] **Step 1: Edit `backend/prisma/schema.prisma`**

Add a new enum after `enum VideoStatus { ... }`:

```prisma
enum EditorStatus {
  NOT_STARTED
  PENDING
  READY
  FAILED
}
```

Add five fields to `model Post` (after `videoUrl`, before `createdAt`):

```prisma
  directionBrief    String
  directionAccepted DateTime?
  editorStatus      EditorStatus @default(NOT_STARTED)
  editorPrompt      String?
  editorReasoning   String?
```

- [ ] **Step 2: Write the migration by hand**

Create `backend/prisma/migrations/20260716000001_editor_workflow_fields/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "EditorStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'READY', 'FAILED');

-- AlterTable: add nullable first so existing rows don't block the ALTER
ALTER TABLE "Post" ADD COLUMN "directionBrief" TEXT;
ALTER TABLE "Post" ADD COLUMN "directionAccepted" TIMESTAMP(3);
ALTER TABLE "Post" ADD COLUMN "editorStatus" "EditorStatus" NOT NULL DEFAULT 'NOT_STARTED';
ALTER TABLE "Post" ADD COLUMN "editorPrompt" TEXT;
ALTER TABLE "Post" ADD COLUMN "editorReasoning" TEXT;

-- Backfill directionBrief from the existing assetNote content
UPDATE "Post" SET "directionBrief" = "assetNote" WHERE "directionBrief" IS NULL;

-- Backfill already-approved posts so the new gates don't retroactively block them
UPDATE "Post" SET "directionAccepted" = NOW(), "editorStatus" = 'READY' WHERE "approved" = true;

-- Now safe to enforce NOT NULL
ALTER TABLE "Post" ALTER COLUMN "directionBrief" SET NOT NULL;
```

- [ ] **Step 3: Apply the migration and regenerate the client**

Run: `cd backend && npx prisma migrate dev`
Expected: Prisma detects the schema diff matches the migration folder already on disk, applies it, and reports `Your database is now in sync with your schema.` followed by Prisma Client generation output.

- [ ] **Step 4: Write the failing test**

Add to `backend/src/tests/schema.test.ts` (follow the existing file's setup — it already connects to a live test DB for schema-level assertions):

```ts
describe('Post schema — editor workflow fields', () => {
  it('creates a Post with directionBrief and defaults editorStatus to NOT_STARTED', async () => {
    const campaign = await createTestCampaign() // reuse this file's existing campaign fixture helper
    const post = await prisma.post.create({
      data: {
        campaignId: campaign.id,
        platform: 'INSTAGRAM',
        caption: 'test caption',
        hashtags: [],
        lyricSource: 'test lyric',
        directionBrief: 'test brief',
        scheduledAt: new Date(),
        dayOffset: 0,
      },
    })
    expect(post.directionBrief).toBe('test brief')
    expect(post.directionAccepted).toBeNull()
    expect(post.editorStatus).toBe('NOT_STARTED')
    expect(post.editorPrompt).toBeNull()
    expect(post.editorReasoning).toBeNull()
  })
})
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx vitest run src/tests/schema.test.ts`
Expected: PASS (requires the local Postgres container running — `docker compose up postgres -d` from the repo root if not already up).

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260716000001_editor_workflow_fields backend/src/tests/schema.test.ts
git commit -m "$(cat <<'EOF'
Add direction/editor workflow fields to Post

directionBrief backfilled from assetNote; already-approved posts get
directionAccepted + editorStatus=READY backfilled so the new gates
don't retroactively block them.
EOF
)"
```

---

## Task 1b: Wire `directionBrief` into `generateCampaign` + fix existing Post fixtures

`directionBrief` is now NOT NULL with no default. Task 1's migration backfills existing rows, but two things still create new `Post` rows without it: `generateCampaign` (production code — every future campaign generation would crash) and two existing test files that call `prisma.post.create` directly. This task fixes both before any editor-agent code depends on `directionBrief` actually existing on freshly-created posts.

**Files:**
- Modify: `backend/src/commands/generate.ts`
- Modify: `backend/tests/db.test.ts`

**Interfaces:**
- Produces: every `Post` created by `generateCampaign` now has `directionBrief` seeded from `draft.assetNote` — the same value that used to populate the now-legacy `assetNote` field, so behavior for existing campaigns is unchanged (just duplicated into the new field, mirroring Task 1's historical-row backfill).

- [ ] **Step 1: Write the failing test**

`backend/tests/generate.test.ts` fully mocks `prisma`/`runArcAgent`/`runContentAgent` (no live DB) and today only tests the two early-throw paths. Add a success-path test that drives `generateCampaign` all the way through and inspects what gets passed to `post.createMany`:

```ts
it('sets directionBrief from the content agent\'s assetNote on every created post', async () => {
  mockPrisma.campaign.findFirst.mockResolvedValue({
    id: 'c1',
    lyricsMarkdown: '## Verse 1\nI keep thinking about us',
    platforms: ['TIKTOK'],
    preReleaseDays: 0,
    postReleaseDays: 0,
    releaseDate: new Date('2026-09-01'),
    contentOrientation: 'VERTICAL',
    contentDuration: 'SHORT_FORM',
    contentResolution: '1080p',
    creativeBrief: null,
    songAnalysis: null,
    assetsFolderUrl: null,
  })
  await generateCampaign('c1', 'user-1')
  const created = mockPrisma.post.createMany.mock.calls[0][0].data
  expect(created).toHaveLength(1)
  expect(created[0].directionBrief).toBe('Cover art')
  expect(created[0].directionBrief).toBe(created[0].assetNote)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/generate.test.ts`
Expected: FAIL — `created[0].directionBrief` is `undefined` (the field isn't set yet).

- [ ] **Step 3: Fix `generate.ts`**

In `backend/src/commands/generate.ts`, modify the `allPosts.push` call (~line 70-79):

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
        })
```

- [ ] **Step 4: Fix `db.test.ts`'s two direct `prisma.post.create` calls**

In `backend/tests/db.test.ts`, add `directionBrief: 'Cover art'` to the `data` object in the `'creates a Post with required lyricSource'` test (~line 64-75), and `directionBrief: 'x'` to the `data` object in the `'cascade deletes posts when campaign is deleted'` test (~line 94-105) — same value pattern as the adjacent `assetNote` field in each case.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && npx vitest run tests/generate.test.ts`
Expected: PASS — 3 tests (2 existing + 1 new), no live DB needed (fully mocked).

Run: `cd backend && npx vitest run tests/db.test.ts`
Expected: PASS — requires live Postgres (`docker compose up postgres -d` from the repo root if not already running); this file was already DB-dependent before this change.

- [ ] **Step 6: Commit**

```bash
git add backend/src/commands/generate.ts backend/tests/generate.test.ts backend/tests/db.test.ts
git commit -m "$(cat <<'EOF'
Seed directionBrief from assetNote in generateCampaign

directionBrief is NOT NULL as of the prior migration — every new Post
needs a value at creation time, not just the historical backfill.
EOF
)"
```

---

## Task 2: `editorAgent.ts` — structured single-turn decision agent

**Files:**
- Create: `backend/src/agents/editorAgent.ts`
- Test: `backend/src/tests/editorAgent.test.ts`

**Interfaces:**
- Consumes: `SongAnalysis` type from `backend/src/lib/musicAnalyzer.ts` (existing); `DriveFile` type from `backend/src/lib/driveClient.ts` (existing).
- Produces: `EditorDecision { assetFileId: string | null; motionPrompt: string | null; reasoning: string }` and `runEditorAgent(input: EditorAgentInput, apiKey?: string): Promise<EditorDecision>` — Task 4 calls this exact function with this exact signature.

- [ ] **Step 1: Write the failing test**

Create `backend/src/tests/editorAgent.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { runEditorAgent } from '../agents/editorAgent.js'

const mockCreate = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate }
  }))
}))

const baseInput = {
  lyricSource: 'think about us',
  songAnalysis: {
    bpm: 120, durationSecs: 180, key: 'A minor', timeSignature: '4/4',
    sections: [{ label: 'chorus', startSecs: 45, durationSecs: 15, description: 'hook' }],
    energyNotes: 'builds steadily', hookMoment: 'chorus at ~0:45', source: 'drive' as const,
  },
  caption: 'this song—',
  hashtags: ['#indiemusic'],
  directionBrief: 'Golden hour, empty chairs, quiet longing',
  assets: [
    { id: 'file-1', name: 'chairs.jpg', mimeType: 'image/jpeg', webViewLink: 'https://x' },
    { id: 'file-2', name: 'crowd.jpg', mimeType: 'image/jpeg', webViewLink: 'https://x' },
  ],
}

describe('runEditorAgent', () => {
  it('returns the agent\'s asset + motion prompt decision', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'tool_use',
        name: 'submit_edit_decision',
        input: { assetFileId: 'file-1', motionPrompt: 'Slow zoom into empty chairs, golden hour haze', reasoning: 'Best fits the empty-chairs imagery in the brief.' },
      }],
      stop_reason: 'tool_use',
    })
    const result = await runEditorAgent(baseInput, 'test-key')
    expect(result.assetFileId).toBe('file-1')
    expect(result.motionPrompt).toBe('Slow zoom into empty chairs, golden hour haze')
    expect(result.reasoning).toBe('Best fits the empty-chairs imagery in the brief.')
  })

  it('returns null assetFileId for a caption-only decision', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'tool_use',
        name: 'submit_edit_decision',
        input: { assetFileId: null, motionPrompt: null, reasoning: 'No available asset fits the brief — caption-only.' },
      }],
      stop_reason: 'tool_use',
    })
    const result = await runEditorAgent({ ...baseInput, assets: [] }, 'test-key')
    expect(result.assetFileId).toBeNull()
    expect(result.motionPrompt).toBeNull()
  })

  it('throws if assetFileId is set but motionPrompt is missing', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'tool_use',
        name: 'submit_edit_decision',
        input: { assetFileId: 'file-1', motionPrompt: null, reasoning: 'incomplete' },
      }],
      stop_reason: 'tool_use',
    })
    await expect(runEditorAgent(baseInput, 'test-key')).rejects.toThrow('motionPrompt required')
  })

  it('includes previous prompt and feedback in the regenerate prompt', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'tool_use',
        name: 'submit_edit_decision',
        input: { assetFileId: 'file-2', motionPrompt: 'Handheld pan across the crowd', reasoning: 'Feedback asked for more movement.' },
      }],
      stop_reason: 'tool_use',
    })
    await runEditorAgent({ ...baseInput, previousPrompt: 'Slow zoom into empty chairs', feedback: 'Too static — add movement' }, 'test-key')
    const promptArg = mockCreate.mock.calls[0][0].messages[0].content
    expect(promptArg).toContain('Too static — add movement')
    expect(promptArg).toContain('Slow zoom into empty chairs')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/tests/editorAgent.test.ts`
Expected: FAIL — `Cannot find module '../agents/editorAgent.js'`

- [ ] **Step 3: Write the implementation**

Create `backend/src/agents/editorAgent.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk'
import type { SongAnalysis } from '../lib/musicAnalyzer.js'
import type { DriveFile } from '../lib/driveClient.js'

export interface EditorDecision {
  assetFileId: string | null
  motionPrompt: string | null
  reasoning: string
}

export interface EditorAgentInput {
  lyricSource: string
  songAnalysis: SongAnalysis | null
  caption: string
  hashtags: string[]
  directionBrief: string
  assets: DriveFile[]
  previousPrompt?: string | null
  feedback?: string | null
}

export const EDITOR_SYSTEM = `You are a viral video editor for music social content. Given a post's creative direction, its song's musical structure, and a list of available images, pick the single best image and write a motion prompt that will drive an image-to-video AI model. Prioritize whatever makes the clip stop a scroll and earn a share — cinematic movement, emotional specificity, tasteful sync to the song's hook moment when relevant. If none of the available images fit the direction, return assetFileId: null for a caption-only post — that's a valid, often-correct choice, not a failure.`

const SUBMIT_EDIT_DECISION_TOOL: Anthropic.Tool = {
  name: 'submit_edit_decision',
  description: 'Submit the creative decision for this post\'s video generation',
  input_schema: {
    type: 'object' as const,
    properties: {
      assetFileId: { type: ['string', 'null'], description: 'Chosen Drive file ID from the available assets, or null if none fit — caption-only post' },
      motionPrompt: { type: ['string', 'null'], description: 'Higgsfield motion prompt describing camera movement and mood; required if assetFileId is set, otherwise null' },
      reasoning: { type: 'string', description: 'One-line justification for this choice, shown to the user' },
    },
    required: ['assetFileId', 'reasoning'],
  },
}

export async function runEditorAgent(input: EditorAgentInput, apiKey?: string): Promise<EditorDecision> {
  const client = new Anthropic({ ...(apiKey ? { apiKey } : {}) })

  const assetsLine = input.assets.length > 0
    ? input.assets.map(a => `- ${a.id}: ${a.name} (${a.mimeType})`).join('\n')
    : 'No image assets available in this campaign.'

  const musicLine = input.songAnalysis
    ? `Music: ${input.songAnalysis.bpm ?? '?'}bpm, hook at ${input.songAnalysis.hookMoment}, sections: ${input.songAnalysis.sections.map(s => `${s.label}@${s.startSecs}s`).join(', ')}`
    : 'No song analysis available.'

  const regenerateLine = input.feedback
    ? `\n\nThis is a regenerate attempt. Previous motion prompt: "${input.previousPrompt}". User feedback: "${input.feedback}". Steer away from what didn't work.`
    : ''

  const prompt = `Lyric: "${input.lyricSource}"
Caption: ${input.caption}
Hashtags: ${input.hashtags.join(', ')}
Creative direction: ${input.directionBrief}
${musicLine}

Available assets:
${assetsLine}${regenerateLine}

Pick the single best asset for this post's video (or null if none fit — caption-only is fine), and write a motion prompt that will drive Higgsfield's image-to-video generation. Reference the hook moment timing if relevant.`

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    system: EDITOR_SYSTEM,
    tools: [SUBMIT_EDIT_DECISION_TOOL],
    tool_choice: { type: 'any' },
    messages: [{ role: 'user', content: prompt }],
  })

  const toolCall = response.content.find(c => c.type === 'tool_use' && c.name === 'submit_edit_decision')
  if (!toolCall || toolCall.type !== 'tool_use') throw new Error('Editor agent: no submit_edit_decision call')

  const decision = toolCall.input as EditorDecision
  if (decision.assetFileId && !decision.motionPrompt) {
    throw new Error('Editor agent: motionPrompt required when assetFileId is set')
  }
  return decision
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/tests/editorAgent.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/agents/editorAgent.ts backend/src/tests/editorAgent.test.ts
git commit -m "$(cat <<'EOF'
Add editorAgent — single structured decision for asset + motion prompt

Same tool-use pattern as contentAgent/arcAgent. Not a multi-turn loop —
one decision, executed deterministically by the caller (Task 4).
EOF
)"
```

---

## Task 3: `PATCH /:id/posts/:postId/direction` route

**Files:**
- Modify: `backend/src/routes/campaigns.ts`
- Test: `backend/src/tests/campaigns.direction.test.ts`

**Interfaces:**
- Consumes: `prisma` (existing `backend/src/lib/db.js` singleton).
- Produces: route sets `Post.directionAccepted = now()` and optionally `caption`/`hashtags`/`directionBrief` — Task 9's frontend `api.updateDirection` call targets this exact route.

- [ ] **Step 1: Write the failing test**

Create `backend/src/tests/campaigns.direction.test.ts` (follow the mocking pattern in `backend/src/tests/campaigns.post-approve.test.ts` — mock `../lib/db.js`'s `prisma` and build an Express app around `campaignsRouter`, `requireAuth` bypassed via session mock):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const mockCampaign = { id: 'camp-1', userId: 'user-1' }
const mockPost = { id: 'post-1', campaignId: 'camp-1', caption: 'orig', hashtags: [], directionBrief: 'orig brief', directionAccepted: null }

vi.mock('../lib/db.js', () => ({
  prisma: {
    campaign: { findFirst: vi.fn().mockResolvedValue(mockCampaign) },
    post: {
      findFirst: vi.fn().mockResolvedValue(mockPost),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...mockPost, ...data, directionAccepted: new Date().toISOString() })),
    },
  },
}))

const { campaignsRouter } = await import('../routes/campaigns.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => { req.session = { userId: 'user-1' } as any; next() })
  app.use('/campaigns', campaignsRouter)
  return app
}

beforeEach(() => vi.clearAllMocks())

describe('PATCH /:id/posts/:postId/direction', () => {
  it('accepts as-is with an empty body and sets directionAccepted', async () => {
    const res = await request(buildApp()).patch('/campaigns/camp-1/posts/post-1/direction').send({})
    expect(res.status).toBe(200)
    expect(res.body.directionAccepted).toBeTruthy()
  })

  it('saves edited fields and sets directionAccepted', async () => {
    const res = await request(buildApp()).patch('/campaigns/camp-1/posts/post-1/direction').send({ caption: 'edited', directionBrief: 'edited brief' })
    expect(res.status).toBe(200)
    expect(res.body.caption).toBe('edited')
    expect(res.body.directionBrief).toBe('edited brief')
    expect(res.body.directionAccepted).toBeTruthy()
  })

  it('404s when the campaign does not belong to the user', async () => {
    const { prisma } = await import('../lib/db.js')
    ;(prisma.campaign.findFirst as any).mockResolvedValueOnce(null)
    const res = await request(buildApp()).patch('/campaigns/camp-1/posts/post-1/direction').send({})
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/tests/campaigns.direction.test.ts`
Expected: FAIL — 404/no route matched (route doesn't exist yet).

- [ ] **Step 3: Add the route**

In `backend/src/routes/campaigns.ts`, add after the existing `UpdatePostSchema`/`PATCH /:id/posts/:postId` block (after line ~284):

```ts
const UpdateDirectionSchema = z.object({
  caption: z.string().min(1).max(2200).optional(),
  hashtags: z.array(z.string()).optional(),
  directionBrief: z.string().min(1).optional(),
})

campaignsRouter.patch('/:id/posts/:postId/direction', async (req, res) => {
  const parsed = UpdateDirectionSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }
  const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id, userId: req.session.userId! } })
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }
  try {
    const post = await prisma.post.update({
      where: { id: req.params.postId, campaignId: campaign.id },
      data: { ...parsed.data, directionAccepted: new Date() },
    })
    res.json(post)
  } catch (err: any) {
    res.status(500).json({ error: 'Internal error', message: err.message })
  }
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/tests/campaigns.direction.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/campaigns.ts backend/src/tests/campaigns.direction.test.ts
git commit -m "feat: add PATCH .../direction route for accept/edit gate"
```

---

## Task 4: `runEditorWorkflow` + `POST /:id/posts/:postId/send-to-editor` (removes `generate-video`)

**Files:**
- Modify: `backend/src/routes/campaigns.ts`
- Test: `backend/src/tests/campaigns.editor-workflow.test.ts`

**Interfaces:**
- Consumes: `runEditorAgent` (Task 2, exact signature `(input: EditorAgentInput, apiKey?: string) => Promise<EditorDecision>`); existing `createVideoJob(imageUrl: string, prompt: string): Promise<{requestId: string}>`, `drivePublicUrl(fileId: string): string`, `listFolderFiles(folderUrl: string, accessToken: string): Promise<DriveFile[]>`, `decrypt(s: string): string`.
- Produces: `async function runEditorWorkflow(postId: string, campaignId: string, userId: string, feedback?: string): Promise<Post>` — Task 5's `regenerate` route calls this exact function with the 4-arg form.

- [ ] **Step 1: Write the failing test**

Create `backend/src/tests/campaigns.editor-workflow.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const mockCampaign = { id: 'camp-1', userId: 'user-1', assetsFolderUrl: 'https://drive.google.com/drive/folders/abc', songAnalysis: null, lyricsMarkdown: null }
const mockUser = { id: 'user-1', accessToken: 'drive-token', anthropicApiKey: null }
const basePost = {
  id: 'post-1', campaignId: 'camp-1', caption: 'c', hashtags: [], lyricSource: 'lyric',
  directionBrief: 'brief', directionAccepted: new Date().toISOString(), editorStatus: 'NOT_STARTED',
}

const mockUpdate = vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...basePost, ...data }))

vi.mock('../lib/db.js', () => ({
  prisma: {
    campaign: { findFirst: vi.fn().mockResolvedValue(mockCampaign) },
    user: { findUnique: vi.fn().mockResolvedValue(mockUser) },
    post: { findFirst: vi.fn().mockResolvedValue(basePost), update: mockUpdate },
  },
}))
vi.mock('../lib/driveClient.js', () => ({
  listFolderFiles: vi.fn().mockResolvedValue([{ id: 'file-1', name: 'a.jpg', mimeType: 'image/jpeg', webViewLink: 'x' }]),
  drivePublicUrl: vi.fn().mockReturnValue('https://drive.example/file-1'),
  fetchDocAsText: vi.fn(),
}))
vi.mock('../lib/higgsfield.js', () => ({
  createVideoJob: vi.fn().mockResolvedValue({ requestId: 'job-1' }),
}))
vi.mock('../agents/editorAgent.js', () => ({
  runEditorAgent: vi.fn(),
}))

const { campaignsRouter } = await import('../routes/campaigns.js')
const { runEditorAgent } = await import('../agents/editorAgent.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => { req.session = { userId: 'user-1' } as any; next() })
  app.use('/campaigns', campaignsRouter)
  return app
}

beforeEach(() => { vi.clearAllMocks(); process.env.ANTHROPIC_API_KEY = 'env-key' })

describe('POST /:id/posts/:postId/send-to-editor', () => {
  it('400s when directionAccepted is not set', async () => {
    const { prisma } = await import('../lib/db.js')
    ;(prisma.post.findFirst as any).mockResolvedValueOnce({ ...basePost, directionAccepted: null })
    const res = await request(buildApp()).post('/campaigns/camp-1/posts/post-1/send-to-editor')
    expect(res.status).toBe(400)
  })

  it('sets editorStatus READY with no video job when the agent picks no asset', async () => {
    ;(runEditorAgent as any).mockResolvedValue({ assetFileId: null, motionPrompt: null, reasoning: 'no fit' })
    const res = await request(buildApp()).post('/campaigns/camp-1/posts/post-1/send-to-editor')
    expect(res.status).toBe(200)
    expect(res.body.editorStatus).toBe('READY')
    expect(res.body.assetFileId).toBeNull()
  })

  it('calls createVideoJob and sets editorStatus/videoStatus PENDING when the agent picks an asset', async () => {
    const { createVideoJob } = await import('../lib/higgsfield.js')
    ;(runEditorAgent as any).mockResolvedValue({ assetFileId: 'file-1', motionPrompt: 'slow zoom', reasoning: 'good fit' })
    const res = await request(buildApp()).post('/campaigns/camp-1/posts/post-1/send-to-editor')
    expect(createVideoJob).toHaveBeenCalledWith('https://drive.example/file-1', 'slow zoom')
    expect(res.status).toBe(200)
    expect(res.body.editorStatus).toBe('PENDING')
    expect(res.body.videoStatus).toBe('PENDING')
    expect(res.body.assetFileId).toBe('file-1')
  })

  it('sets editorStatus FAILED when the agent call throws', async () => {
    ;(runEditorAgent as any).mockRejectedValue(new Error('rate limited'))
    const res = await request(buildApp()).post('/campaigns/camp-1/posts/post-1/send-to-editor')
    expect(res.status).toBe(200)
    expect(res.body.editorStatus).toBe('FAILED')
  })

  it('sets editorStatus FAILED when createVideoJob throws', async () => {
    const { createVideoJob } = await import('../lib/higgsfield.js')
    ;(runEditorAgent as any).mockResolvedValue({ assetFileId: 'file-1', motionPrompt: 'slow zoom', reasoning: 'good fit' })
    ;(createVideoJob as any).mockRejectedValueOnce(new Error('bad credentials'))
    const res = await request(buildApp()).post('/campaigns/camp-1/posts/post-1/send-to-editor')
    expect(res.status).toBe(200)
    expect(res.body.editorStatus).toBe('FAILED')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/tests/campaigns.editor-workflow.test.ts`
Expected: FAIL — 404 (route doesn't exist yet).

- [ ] **Step 3: Remove the old `generate-video` route, add `runEditorWorkflow` + `send-to-editor` route**

In `backend/src/routes/campaigns.ts`:

Delete the entire existing block (lines ~235-260):

```ts
campaignsRouter.post('/:id/posts/:postId/generate-video', async (req, res) => {
  // ...entire existing body...
})
```

Add the import at the top (alongside the existing `driveClient`/`higgsfield` imports):

```ts
import { runEditorAgent } from '../agents/editorAgent.js'
import type { DriveFile } from '../lib/driveClient.js'
```

Add `runEditorWorkflow` as a module-level function (place it right before the `PATCH /:id/posts/:postId/direction` route added in Task 3):

```ts
async function runEditorWorkflow(postId: string, campaignId: string, userId: string, feedback?: string) {
  await prisma.post.update({ where: { id: postId }, data: { editorStatus: 'PENDING' } })

  try {
    const [campaign, user, post] = await Promise.all([
      prisma.campaign.findFirst({ where: { id: campaignId, userId } }),
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.post.findFirst({ where: { id: postId, campaignId } }),
    ])
    if (!campaign) throw new Error('Campaign not found')
    if (!post) throw new Error('Post not found')

    let anthropicApiKey: string | undefined
    try {
      anthropicApiKey = user?.anthropicApiKey ? decrypt(user.anthropicApiKey) : process.env.ANTHROPIC_API_KEY
    } catch {
      throw new Error('Anthropic API key unreadable — re-save in Settings')
    }
    if (!anthropicApiKey) throw new Error('Anthropic API key not configured')

    let assets: DriveFile[] = []
    if (campaign.assetsFolderUrl && user?.accessToken) {
      const allAssets = await listFolderFiles(campaign.assetsFolderUrl, user.accessToken)
      assets = allAssets.filter(a => a.mimeType.startsWith('image/'))
    }

    const decision = await runEditorAgent({
      lyricSource: post.lyricSource,
      songAnalysis: campaign.songAnalysis as any,
      caption: post.caption,
      hashtags: post.hashtags,
      directionBrief: post.directionBrief,
      assets,
      previousPrompt: post.editorPrompt,
      feedback,
    }, anthropicApiKey)

    if (!decision.assetFileId) {
      return await prisma.post.update({
        where: { id: postId },
        data: { editorStatus: 'READY', assetFileId: null, assetMimeType: null, editorPrompt: null, editorReasoning: decision.reasoning },
      })
    }

    const chosenAsset = assets.find(a => a.id === decision.assetFileId)
    const imageUrl = drivePublicUrl(decision.assetFileId)
    const { requestId } = await createVideoJob(imageUrl, decision.motionPrompt!)

    return await prisma.post.update({
      where: { id: postId },
      data: {
        assetFileId: decision.assetFileId,
        assetMimeType: chosenAsset?.mimeType ?? null,
        editorPrompt: decision.motionPrompt,
        editorReasoning: decision.reasoning,
        videoJobId: requestId,
        videoStatus: 'PENDING',
        videoUrl: null,
        editorStatus: 'PENDING',
      },
    })
  } catch {
    return await prisma.post.update({ where: { id: postId }, data: { editorStatus: 'FAILED' } })
  }
}

campaignsRouter.post('/:id/posts/:postId/send-to-editor', async (req, res) => {
  const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id, userId: req.session.userId! } })
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }
  const post = await prisma.post.findFirst({ where: { id: req.params.postId, campaignId: campaign.id } })
  if (!post) { res.status(404).json({ error: 'Post not found' }); return }
  if (!post.directionAccepted) { res.status(400).json({ error: 'Direction must be accepted first' }); return }
  try {
    const updated = await runEditorWorkflow(post.id, campaign.id, req.session.userId!)
    res.json(updated)
  } catch (err: any) {
    res.status(500).json({ error: 'Send to editor failed', message: err.message })
  }
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/tests/campaigns.editor-workflow.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Remove the now-unused frontend call site's old test coverage**

Check `backend/src/tests/` and `backend/tests/` for any test still exercising `POST .../generate-video` (there shouldn't be one — the video-generation feature only ever had frontend/route coverage per `higgsfield.test.ts`, which tests `checkJobStatus` directly, not the route). Run `cd backend && npx vitest run` and confirm no test references the deleted route.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/campaigns.ts backend/src/tests/campaigns.editor-workflow.test.ts
git commit -m "$(cat <<'EOF'
Replace generate-video with runEditorWorkflow + send-to-editor route

The editor agent now picks the asset and writes the motion prompt;
the old manual-prompt route is dead code once PostEditor stops
calling it (frontend follow-up in Task 9).
EOF
)"
```

---

## Task 5: `POST /:id/posts/:postId/regenerate` route

**Files:**
- Modify: `backend/src/routes/campaigns.ts`
- Test: `backend/src/tests/campaigns.editor-workflow.test.ts` (extend)

**Interfaces:**
- Consumes: `runEditorWorkflow` (Task 4, 4-arg form with `feedback`).
- Produces: route requires prior `editorStatus` of `READY`/`FAILED`; Task 11's frontend `api.regeneratePost` call targets this exact route.

- [ ] **Step 1: Write the failing test**

Add to `backend/src/tests/campaigns.editor-workflow.test.ts`:

```ts
describe('POST /:id/posts/:postId/regenerate', () => {
  it('400s when editorStatus is NOT_STARTED (no prior attempt)', async () => {
    const res = await request(buildApp()).post('/campaigns/camp-1/posts/post-1/regenerate').send({})
    expect(res.status).toBe(400)
  })

  it('400s when editorStatus is PENDING (attempt in flight)', async () => {
    const { prisma } = await import('../lib/db.js')
    ;(prisma.post.findFirst as any).mockResolvedValueOnce({ ...basePost, editorStatus: 'PENDING' })
    const res = await request(buildApp()).post('/campaigns/camp-1/posts/post-1/regenerate').send({})
    expect(res.status).toBe(400)
  })

  it('reruns the editor agent with feedback when editorStatus is READY', async () => {
    const { prisma } = await import('../lib/db.js')
    ;(prisma.post.findFirst as any).mockResolvedValue({ ...basePost, editorStatus: 'READY', editorPrompt: 'slow zoom' })
    ;(runEditorAgent as any).mockResolvedValue({ assetFileId: 'file-1', motionPrompt: 'handheld pan', reasoning: 'more movement' })
    const res = await request(buildApp()).post('/campaigns/camp-1/posts/post-1/regenerate').send({ feedback: 'Too static' })
    expect(res.status).toBe(200)
    expect(runEditorAgent).toHaveBeenCalledWith(expect.objectContaining({ feedback: 'Too static', previousPrompt: 'slow zoom' }), expect.any(String))
  })

  it('reruns when editorStatus is FAILED', async () => {
    const { prisma } = await import('../lib/db.js')
    ;(prisma.post.findFirst as any).mockResolvedValue({ ...basePost, editorStatus: 'FAILED' })
    ;(runEditorAgent as any).mockResolvedValue({ assetFileId: null, motionPrompt: null, reasoning: 'ok' })
    const res = await request(buildApp()).post('/campaigns/camp-1/posts/post-1/regenerate').send({})
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/tests/campaigns.editor-workflow.test.ts`
Expected: FAIL — 404 (route doesn't exist yet).

- [ ] **Step 3: Add the route**

In `backend/src/routes/campaigns.ts`, add right after the `send-to-editor` route:

```ts
const RegenerateSchema = z.object({ feedback: z.string().optional() })

campaignsRouter.post('/:id/posts/:postId/regenerate', async (req, res) => {
  const parsed = RegenerateSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }
  const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id, userId: req.session.userId! } })
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }
  const post = await prisma.post.findFirst({ where: { id: req.params.postId, campaignId: campaign.id } })
  if (!post) { res.status(404).json({ error: 'Post not found' }); return }
  if (post.editorStatus !== 'READY' && post.editorStatus !== 'FAILED') {
    res.status(400).json({ error: 'No prior editor attempt to regenerate from' }); return
  }
  try {
    const updated = await runEditorWorkflow(post.id, campaign.id, req.session.userId!, parsed.data.feedback)
    res.json(updated)
  } catch (err: any) {
    res.status(500).json({ error: 'Regenerate failed', message: err.message })
  }
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/tests/campaigns.editor-workflow.test.ts`
Expected: PASS — 9 tests total (5 send-to-editor + 4 regenerate).

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/campaigns.ts backend/src/tests/campaigns.editor-workflow.test.ts
git commit -m "feat: add POST .../regenerate route with feedback loop"
```

---

## Task 6: Gate `approve` on `editorStatus === 'READY'`

**Files:**
- Modify: `backend/src/routes/campaigns.ts`
- Modify: `backend/src/tests/campaigns.post-approve.test.ts` (extend)

**Interfaces:**
- Consumes: existing `PATCH /:id/posts/:postId` route (`UpdatePostSchema`, approve is `{approved: true}` through this same route per current code).
- Produces: 400 response `{error: 'Editor agent must produce a finished output before approving'}` when `approved: true` is requested but `editorStatus !== 'READY'`.

**Note:** `campaigns.post-approve.test.ts` is a live-DB integration test — it imports the real `app`, creates real rows via `prisma` in `beforeAll`, and hits routes with `supertest`. It is **not** mocked-Express-per-test like Tasks 3-5's new test files. Follow its existing pattern exactly (real `prisma.post.create` fixtures + `afterAll` cleanup), not a mocked-`prisma` unit test.

- [ ] **Step 1: Write the failing test**

Add three more fixture posts to the existing `beforeAll` in `backend/src/tests/campaigns.post-approve.test.ts` (right after the `unapprovedPost` creation, still inside `pushCampaignId`):

```ts
  const notStartedGatePost = await prisma.post.create({
    data: {
      campaignId: pushCampaignId,
      platform: 'TIKTOK',
      caption: 'Gate test — not started',
      hashtags: ['#gate'],
      lyricSource: 'Gate lyric',
      assetNote: 'Gate asset note',
      directionBrief: 'Gate direction brief',
      scheduledAt: new Date('2026-10-03'),
      dayOffset: 2,
      editorStatus: 'NOT_STARTED',
    },
  })
  notStartedGatePostId = notStartedGatePost.id

  const pendingGatePost = await prisma.post.create({
    data: {
      campaignId: pushCampaignId,
      platform: 'TIKTOK',
      caption: 'Gate test — pending',
      hashtags: ['#gate'],
      lyricSource: 'Gate lyric',
      assetNote: 'Gate asset note',
      directionBrief: 'Gate direction brief',
      scheduledAt: new Date('2026-10-04'),
      dayOffset: 3,
      editorStatus: 'PENDING',
    },
  })
  pendingGatePostId = pendingGatePost.id

  const readyGatePost = await prisma.post.create({
    data: {
      campaignId: pushCampaignId,
      platform: 'TIKTOK',
      caption: 'Gate test — ready',
      hashtags: ['#gate'],
      lyricSource: 'Gate lyric',
      assetNote: 'Gate asset note',
      directionBrief: 'Gate direction brief',
      scheduledAt: new Date('2026-10-05'),
      dayOffset: 4,
      editorStatus: 'READY',
    },
  })
  readyGatePostId = readyGatePost.id
```

Add the three matching `let` declarations next to the other fixture-id declarations near the top of the file:

```ts
let notStartedGatePostId: string
let pendingGatePostId: string
let readyGatePostId: string
```

Add these two existing `assetNote` calls (`testPostId`'s and the two `approvedPost`/`unapprovedPost` fixtures) need `directionBrief` too — since `directionBrief` is now NOT NULL, add `directionBrief: 'Test direction brief'`, `directionBrief: 'Approved direction brief'`, and `directionBrief: 'Unapproved direction brief'` respectively to each of those three existing `data` objects (mirroring their adjacent `assetNote` values).

Add the new describe block at the end of the file:

```ts
describe('PATCH /api/campaigns/:id/posts/:postId — approve gate on editorStatus', () => {
  it('400s when approving a post with editorStatus NOT_STARTED', async () => {
    const res = await request(app)
      .patch(`/api/campaigns/${pushCampaignId}/posts/${notStartedGatePostId}`)
      .send({ approved: true })
    expect(res.status).toBe(400)
  })

  it('400s when approving a post with editorStatus PENDING', async () => {
    const res = await request(app)
      .patch(`/api/campaigns/${pushCampaignId}/posts/${pendingGatePostId}`)
      .send({ approved: true })
    expect(res.status).toBe(400)
  })

  it('succeeds when approving a post with editorStatus READY', async () => {
    const res = await request(app)
      .patch(`/api/campaigns/${pushCampaignId}/posts/${readyGatePostId}`)
      .send({ approved: true })
    expect(res.status).toBe(200)
    expect(res.body.approved).toBe(true)
  })

  it('does not require editorStatus when approved is not in the request body', async () => {
    const res = await request(app)
      .patch(`/api/campaigns/${pushCampaignId}/posts/${notStartedGatePostId}`)
      .send({ caption: 'just a caption edit' })
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/tests/campaigns.post-approve.test.ts`
Expected: FAIL — needs live Postgres (`docker compose up postgres -d` from the repo root if not already running). First two new tests get 200 instead of 400 (no gate exists yet).

- [ ] **Step 3: Add the gate**

In `backend/src/routes/campaigns.ts`, modify the existing `PATCH /:id/posts/:postId` route (~line 270-284) to look up the post before updating and check the gate when `approved: true` is requested:

```ts
campaignsRouter.patch('/:id/posts/:postId', async (req, res) => {
  const parsed = UpdatePostSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }
  const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id, userId: req.session.userId! } })
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }
  if (parsed.data.approved === true) {
    const post = await prisma.post.findFirst({ where: { id: req.params.postId, campaignId: campaign.id } })
    if (!post) { res.status(404).json({ error: 'Post not found' }); return }
    if (post.editorStatus !== 'READY') {
      res.status(400).json({ error: 'Editor agent must produce a finished output before approving' }); return
    }
  }
  try {
    const post = await prisma.post.update({
      where: { id: req.params.postId, campaignId: campaign.id },
      data: parsed.data,
    })
    res.json(post)
  } catch (err: any) {
    res.status(500).json({ error: 'Internal error', message: err.message })
  }
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/tests/campaigns.post-approve.test.ts`
Expected: PASS — all tests including the 4 new ones.

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && npx vitest run`
Expected: all green except the pre-existing DB-dependent files that need live Postgres (unrelated to this change).

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/campaigns.ts backend/src/tests/campaigns.post-approve.test.ts
git commit -m "$(cat <<'EOF'
Gate post approval on editorStatus === READY

Approving a post whose editor agent hasn't produced a finished output
now 400s instead of silently succeeding.
EOF
)"
```

---

## Task 7: `pollAllPendingPosts` flips `editorStatus` alongside `videoStatus`

**Files:**
- Modify: `backend/src/lib/higgsfield.ts`
- Modify: `backend/tests/higgsfield.test.ts`

**Interfaces:**
- Consumes: existing `checkJobStatus(requestId: string): Promise<{status: string; videoUrl?: string}>` (unchanged).
- Produces: `pollAllPendingPosts` now also writes `editorStatus: 'READY'` on completion and `editorStatus: 'FAILED'` on failure — this is the only place a completed Higgsfield job surfaces up to the Approve gate (Task 6).

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/higgsfield.test.ts` (it currently only tests `checkJobStatus`; this adds `pollAllPendingPosts` coverage with a mocked `prisma`):

```ts
vi.mock('../src/lib/db.js', () => ({
  prisma: {
    post: {
      findMany: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}))

describe('pollAllPendingPosts', () => {
  beforeEach(() => {
    process.env.HIGGSFIELD_API_KEY = 'test-key'
    process.env.HIGGSFIELD_API_SECRET = 'test-secret'
  })

  it('sets videoStatus and editorStatus to READY on completion', async () => {
    const { prisma } = await import('../src/lib/db.js')
    ;(prisma.post.findMany as any).mockResolvedValue([{ id: 'post-1', videoJobId: 'job-1' }])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ status: 'completed', video: { url: 'https://cdn.higgsfield.ai/v.mp4' } })
    }))
    const { pollAllPendingPosts } = await import('../src/lib/higgsfield.js')
    await pollAllPendingPosts()
    expect(prisma.post.update).toHaveBeenCalledWith({
      where: { id: 'post-1' },
      data: { videoStatus: 'READY', videoUrl: 'https://cdn.higgsfield.ai/v.mp4', editorStatus: 'READY' },
    })
  })

  it('sets videoStatus and editorStatus to FAILED on failure', async () => {
    const { prisma } = await import('../src/lib/db.js')
    ;(prisma.post.findMany as any).mockResolvedValue([{ id: 'post-2', videoJobId: 'job-2' }])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ status: 'failed' })
    }))
    const { pollAllPendingPosts } = await import('../src/lib/higgsfield.js')
    await pollAllPendingPosts()
    expect(prisma.post.update).toHaveBeenCalledWith({
      where: { id: 'post-2' },
      data: { videoStatus: 'FAILED', editorStatus: 'FAILED' },
    })
  })

  it('does not touch editorStatus while still in_progress', async () => {
    const { prisma } = await import('../src/lib/db.js')
    ;(prisma.post.findMany as any).mockResolvedValue([{ id: 'post-3', videoJobId: 'job-3' }])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ status: 'in_progress' })
    }))
    const { pollAllPendingPosts } = await import('../src/lib/higgsfield.js')
    await pollAllPendingPosts()
    expect(prisma.post.update).toHaveBeenCalledWith({ where: { id: 'post-3' }, data: { videoStatus: 'PROCESSING' } })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/higgsfield.test.ts`
Expected: FAIL — the `completed`/`failed` cases assert `editorStatus` in the update payload, which isn't written yet.

- [ ] **Step 3: Update `pollAllPendingPosts`**

In `backend/src/lib/higgsfield.ts`, replace the function body:

```ts
export async function pollAllPendingPosts(): Promise<void> {
  const pending = await prisma.post.findMany({
    where: { videoStatus: { in: ['PENDING', 'PROCESSING'] }, videoJobId: { not: null } },
  })
  for (const post of pending) {
    try {
      const { status, videoUrl } = await checkJobStatus(post.videoJobId!)
      if (status === 'completed' && videoUrl) {
        await prisma.post.update({ where: { id: post.id }, data: { videoStatus: 'READY', videoUrl, editorStatus: 'READY' } })
      } else if (status === 'failed' || status === 'nsfw') {
        await prisma.post.update({ where: { id: post.id }, data: { videoStatus: 'FAILED', editorStatus: 'FAILED' } })
      } else if (status === 'in_progress') {
        await prisma.post.update({ where: { id: post.id }, data: { videoStatus: 'PROCESSING' } })
      }
    } catch {
      // log but don't crash the poll loop
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/higgsfield.test.ts`
Expected: PASS — 5 tests (2 existing `checkJobStatus` + 3 new `pollAllPendingPosts`).

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/higgsfield.ts backend/tests/higgsfield.test.ts
git commit -m "feat: flip editorStatus alongside videoStatus in pollAllPendingPosts"
```

---

## Task 8: `api.ts` — add direction/editor client methods, remove `generatePostVideo`

**Files:**
- Modify: `frontend/src/lib/api.ts`

**Interfaces:**
- Produces: `api.updateDirection(campaignId: string, postId: string, data: {caption?: string; hashtags?: string[]; directionBrief?: string}): Promise<any>`, `api.sendToEditor(campaignId: string, postId: string): Promise<any>`, `api.regeneratePost(campaignId: string, postId: string, feedback?: string): Promise<any>` — Tasks 9-11's `PostEditor.tsx` call these exact signatures. `api.getPost` (already exists) is reused for polling.

This is a small, self-contained change with no independent test file — `frontend/src/lib/api.ts` has no dedicated test file today (it's exercised indirectly through component tests), consistent with the existing pattern; Tasks 9-11's `PostEditor.test.tsx` mocks this module wholesale.

- [ ] **Step 1: Edit `frontend/src/lib/api.ts`**

Remove the `generatePostVideo` method:

```ts
  generatePostVideo: (campaignId: string, postId: string, prompt?: string) =>
    req<any>(`/campaigns/${campaignId}/posts/${postId}/generate-video`, { method: 'POST', body: JSON.stringify({ prompt }) }),
```

Add these methods right after `pushPost` (in place of the removed method):

```ts
  updateDirection: (campaignId: string, postId: string, data: { caption?: string; hashtags?: string[]; directionBrief?: string }) =>
    req<any>(`/campaigns/${campaignId}/posts/${postId}/direction`, { method: 'PATCH', body: JSON.stringify(data) }),
  sendToEditor: (campaignId: string, postId: string) =>
    req<any>(`/campaigns/${campaignId}/posts/${postId}/send-to-editor`, { method: 'POST' }),
  regeneratePost: (campaignId: string, postId: string, feedback?: string) =>
    req<any>(`/campaigns/${campaignId}/posts/${postId}/regenerate`, { method: 'POST', body: JSON.stringify({ feedback }) }),
```

- [ ] **Step 2: Confirm no remaining references to the removed method**

Run: `cd frontend && grep -r "generatePostVideo" src/`
Expected: no output (Tasks 9-11 remove `PostEditor.tsx`'s only call site — if this step runs before Task 9, it's expected to still show one match in `PostEditor.tsx`; re-run after Task 9 to confirm zero).

- [ ] **Step 3: Run the frontend typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS (no other file references `generatePostVideo`).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: add updateDirection/sendToEditor/regeneratePost API methods"
```

---

## Task 9: `PostEditor.tsx` rewrite — Stage 1 (Direction Review) + removal of manual asset-picker/video controls

**Files:**
- Modify: `frontend/src/components/posts/PostEditor.tsx` (full rewrite)
- Modify: `frontend/src/components/posts/PostEditor.test.tsx` (full rewrite)

**Interfaces:**
- Consumes: `api.updateDirection`, `api.updatePost`, `api.approvePost`, `api.pushPost` (existing/Task 8). Does **not** consume `api.getAssets`/`api.generatePostVideo` — those call sites are removed entirely.
- Produces: `stage: 1 | 2` computed as `livePost.directionAccepted ? 2 : 1` (Task 10 widens this to `1 | 2 | 3`). Two independent top-level JSX blocks — `{stage === 1 && (...)}` and `{stage !== 1 && (...)}` — so Tasks 10-11 can insert new sibling blocks without touching this task's markup.

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `frontend/src/components/posts/PostEditor.test.tsx`:

```tsx
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PostEditor } from './PostEditor.js'
import { api } from '../../lib/api.js'

vi.mock('../../lib/api.js', () => ({
  api: {
    updatePost: vi.fn().mockResolvedValue({}),
    updateDirection: vi.fn().mockResolvedValue({}),
    approvePost: vi.fn().mockResolvedValue({ approved: true }),
    pushPost: vi.fn().mockResolvedValue({}),
  },
}))

const BASE_POST = {
  id: 'post-1',
  campaignId: 'camp-1',
  platform: 'INSTAGRAM' as const,
  caption: 'Test caption for the post',
  hashtags: ['#music', '#newrelease'],
  lyricSource: 'Test lyric quote',
  directionBrief: 'Golden hour, empty chairs, quiet longing',
  scheduledAt: new Date('2026-07-20').toISOString(),
  dayOffset: 1,
  approved: false,
  bufferId: null,
  directionAccepted: null as string | null,
  editorStatus: 'NOT_STARTED',
  editorPrompt: null as string | null,
  editorReasoning: null as string | null,
  assetFileId: null as string | null,
  assetMimeType: null as string | null,
  videoUrl: null as string | null,
  videoStatus: null as string | null,
}

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
}

beforeEach(() => vi.clearAllMocks())

describe('PostEditor — Stage 1: Direction Review', () => {
  it('renders the auto-generated direction read-only with Accept and Edit buttons', () => {
    render(wrap(<PostEditor post={BASE_POST} campaignId="camp-1" onClose={() => {}} />))
    expect(screen.getByText('Golden hour, empty chairs, quiet longing')).toBeInTheDocument()
    expect(screen.getByText('Accept')).toBeInTheDocument()
    expect(screen.getByText('Edit')).toBeInTheDocument()
  })

  it('calls updateDirection with no field changes when Accept is clicked', async () => {
    render(wrap(<PostEditor post={BASE_POST} campaignId="camp-1" onClose={() => {}} />))
    fireEvent.click(screen.getByText('Accept'))
    await waitFor(() => expect(api.updateDirection).toHaveBeenCalledWith('camp-1', 'post-1', {}))
  })

  it('switches to editable fields and shows Save & Accept / Cancel when Edit is clicked', () => {
    render(wrap(<PostEditor post={BASE_POST} campaignId="camp-1" onClose={() => {}} />))
    fireEvent.click(screen.getByText('Edit'))
    expect(screen.getByDisplayValue('Test caption for the post')).toBeInTheDocument()
    expect(screen.getByText('Save & Accept')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })

  it('calls updateDirection with edited values when Save & Accept is clicked', async () => {
    render(wrap(<PostEditor post={BASE_POST} campaignId="camp-1" onClose={() => {}} />))
    fireEvent.click(screen.getByText('Edit'))
    fireEvent.change(screen.getByDisplayValue('Test caption for the post'), { target: { value: 'Edited caption' } })
    fireEvent.click(screen.getByText('Save & Accept'))
    await waitFor(() => expect(api.updateDirection).toHaveBeenCalledWith('camp-1', 'post-1', {
      caption: 'Edited caption',
      hashtags: ['#music', '#newrelease'],
      directionBrief: 'Golden hour, empty chairs, quiet longing',
    }))
  })
})
```

(The pre-existing `describe('PostEditor — approval gate', ...)` block from the original file is intentionally dropped here — its fixtures (`BASE_POST` without `directionAccepted`/`editorStatus`) no longer represent valid states once Task 11 gates Approve on `editorStatus`. Task 11 reintroduces equivalent coverage against the new `STAGE3_READY_POST` fixture.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/posts/PostEditor.test.tsx`
Expected: FAIL — `Unable to find an element with the text: Golden hour, empty chairs, quiet longing` (component still renders the old asset-picker/motion-prompt UI).

- [ ] **Step 3: Rewrite the implementation**

Replace the entire contents of `frontend/src/components/posts/PostEditor.tsx`:

```tsx
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
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

  const stage: 1 | 2 = livePost.directionAccepted ? 2 : 1

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
              <Button variant="ghost" onClick={onClose} size="sm">Cancel</Button>

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
```

Note: the `Approve` button's `disabled` here is only `approveMutation.isPending` — Task 11 adds the `editorStatus !== 'READY'` condition. Since `stage` is `1 | 2` in this task (nothing reaches a `READY`-equivalent state yet), leaving Approve's gating to Task 11 is correct and doesn't regress any test in this task.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/posts/PostEditor.test.tsx`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/posts/PostEditor.tsx frontend/src/components/posts/PostEditor.test.tsx
git commit -m "$(cat <<'EOF'
Rewrite PostEditor for the 3-stage pipeline — Stage 1: Direction Review

Removes the manual asset-picker/motion-prompt controls entirely.
Stage 2/3 UI lands in follow-up commits; Approve/Push footer is
unchanged pending the editorStatus gate wiring.
EOF
)"
```

---

## Task 10 — `PostEditor.tsx`: Stage 2 (Send to Editor Agent)

**Files:**
- Modify: `frontend/src/components/posts/PostEditor.tsx`
- Modify: `frontend/src/components/posts/PostEditor.test.tsx`

**Interfaces:**
- Consumes: `api.sendToEditor`, `api.getPost` (Task 8, existing).
- Produces: Stage 2 UI; `stage === 2` when `directionAccepted` is set and `editorStatus` is `NOT_STARTED`/`PENDING`.

- [ ] **Step 1: Write the failing tests.**

Add fixtures and a describe block to `frontend/src/components/posts/PostEditor.test.tsx`. First, extend the `vi.mock('../../lib/api.js', ...)` object to add `sendToEditor` and `getPost`:

```tsx
vi.mock('../../lib/api.js', () => ({
  api: {
    updatePost: vi.fn().mockResolvedValue({}),
    updateDirection: vi.fn().mockResolvedValue({}),
    approvePost: vi.fn().mockResolvedValue({ approved: true }),
    pushPost: vi.fn().mockResolvedValue({}),
    sendToEditor: vi.fn().mockResolvedValue({}),
    getPost: vi.fn(),
  },
}))
```

Add fixtures below `BASE_POST`:

```tsx
const STAGE2_POST = { ...BASE_POST, directionAccepted: '2026-07-16T00:00:00.000Z', editorStatus: 'NOT_STARTED' }
const STAGE2_PENDING_POST = { ...STAGE2_POST, editorStatus: 'PENDING' }
```

Add a new describe block after the Stage 1 block:

```tsx
describe('PostEditor — Stage 2: Send to Editor', () => {
  it('renders the accepted directionBrief read-only with a Send to Editor Agent button', () => {
    render(wrap(<PostEditor post={STAGE2_POST} campaignId="camp-1" onClose={() => {}} />))
    expect(screen.getByText('Golden hour, empty chairs, quiet longing')).toBeInTheDocument()
    expect(screen.getByText('Send to Editor Agent →')).toBeInTheDocument()
    expect(screen.queryByText('Accept')).not.toBeInTheDocument()
    expect(screen.queryByText('Edit')).not.toBeInTheDocument()
  })

  it('calls sendToEditor when the button is clicked', async () => {
    render(wrap(<PostEditor post={STAGE2_POST} campaignId="camp-1" onClose={() => {}} />))
    fireEvent.click(screen.getByText('Send to Editor Agent →'))
    await waitFor(() => expect(api.sendToEditor).toHaveBeenCalledWith('camp-1', 'post-1'))
  })

  it('shows a working indicator and hides the Send button while editorStatus is PENDING', () => {
    ;(api.getPost as any).mockResolvedValue(STAGE2_PENDING_POST)
    render(wrap(<PostEditor post={STAGE2_PENDING_POST} campaignId="camp-1" onClose={() => {}} />))
    expect(screen.getByText('Editor agent is working…')).toBeInTheDocument()
    expect(screen.queryByText('Send to Editor Agent →')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run — verify it fails.**

```bash
cd frontend && npx vitest run src/components/posts/PostEditor.test.tsx
```

Expected failure: `Unable to find an element with the text: Send to Editor Agent →` (Stage 2 branch doesn't exist yet).

- [ ] **Step 3: Implement.**

In `frontend/src/components/posts/PostEditor.tsx`:

Add the polling query and `sendToEditorMutation` (after `acceptDirectionMutation`, before `approveMutation`):

```tsx
  const isEditorPending = livePost.editorStatus === 'PENDING'

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
```

Add `useQuery` and `useEffect` to the import line at the top of the file:

```tsx
import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
```

Update the `stage` computation:

```tsx
  const stage: 1 | 2 | 3 = !livePost.directionAccepted
    ? 1
    : (livePost.editorStatus === 'READY' || livePost.editorStatus === 'FAILED')
      ? 3
      : 2
```

Add the Stage 2 block right after the Stage 1 block (`{stage === 1 && (...)}`):

```tsx
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
                    <Button
                      size="sm"
                      onClick={() => sendToEditorMutation.mutate()}
                      disabled={sendToEditorMutation.isPending}
                    >
                      {sendToEditorMutation.isPending ? 'Sending…' : 'Send to Editor Agent →'}
                    </Button>
                  )}
                </div>
              )}
```

- [ ] **Step 4: Run — verify it passes.**

```bash
cd frontend && npx vitest run src/components/posts/PostEditor.test.tsx
```

Expected: all 7 tests pass (4 Stage1 + 3 Stage2).

- [ ] **Step 5: Commit.**

```bash
git add frontend/src/components/posts/PostEditor.tsx frontend/src/components/posts/PostEditor.test.tsx
git commit -m "$(cat <<'EOF'
Add Stage 2 (Send to Editor Agent) to PostEditor

Polls every 3s while editorStatus is PENDING, matching the existing
video-status poll pattern.
EOF
)"
```

---

## Task 11 — `PostEditor.tsx`: Stage 3 (Review) + Approve gate + Regenerate

**Files:**
- Modify: `frontend/src/components/posts/PostEditor.tsx`
- Modify: `frontend/src/components/posts/PostEditor.test.tsx`

**Interfaces:**
- Consumes: `api.regeneratePost` (Task 8).
- Produces: final `PostEditor.tsx` — Stage 3 UI, `Approve` disabled unless `editorStatus === 'READY'`.

- [ ] **Step 1: Write the failing tests.**

Extend the `vi.mock('../../lib/api.js', ...)` object with `regeneratePost`:

```tsx
vi.mock('../../lib/api.js', () => ({
  api: {
    updatePost: vi.fn().mockResolvedValue({}),
    updateDirection: vi.fn().mockResolvedValue({}),
    approvePost: vi.fn().mockResolvedValue({ approved: true }),
    pushPost: vi.fn().mockResolvedValue({}),
    sendToEditor: vi.fn().mockResolvedValue({}),
    getPost: vi.fn(),
    regeneratePost: vi.fn().mockResolvedValue({}),
  },
}))
```

Add fixtures below `STAGE2_PENDING_POST`:

```tsx
const STAGE3_READY_POST = {
  ...BASE_POST,
  directionAccepted: '2026-07-16T00:00:00.000Z',
  editorStatus: 'READY',
  editorReasoning: 'Best fits the empty-chairs imagery in the brief.',
  editorPrompt: 'Slow zoom into empty chairs, golden hour haze',
  assetFileId: 'file-1',
  assetMimeType: 'image/jpeg',
}
const STAGE3_FAILED_POST = { ...BASE_POST, directionAccepted: '2026-07-16T00:00:00.000Z', editorStatus: 'FAILED' }
```

Add a new describe block after the Stage 2 block:

```tsx
describe('PostEditor — Stage 3: Review', () => {
  it('shows the reasoning, motion prompt, and Regenerate control when READY', () => {
    render(wrap(<PostEditor post={STAGE3_READY_POST} campaignId="camp-1" onClose={() => {}} />))
    expect(screen.getByText('Best fits the empty-chairs imagery in the brief.')).toBeInTheDocument()
    expect(screen.getByText('Slow zoom into empty chairs, golden hour haze')).toBeInTheDocument()
    expect(screen.getByText('Regenerate ↺')).toBeInTheDocument()
  })

  it('shows a failure message and only Regenerate when FAILED', () => {
    render(wrap(<PostEditor post={STAGE3_FAILED_POST} campaignId="camp-1" onClose={() => {}} />))
    expect(screen.getByText(/Editor agent failed/)).toBeInTheDocument()
    expect(screen.getByText('Regenerate ↺')).toBeInTheDocument()
    expect(screen.getByText('Approve')).toBeDisabled()
  })

  it('calls regeneratePost with feedback text when Regenerate is clicked', async () => {
    render(wrap(<PostEditor post={STAGE3_READY_POST} campaignId="camp-1" onClose={() => {}} />))
    fireEvent.change(screen.getByPlaceholderText('Feedback for regenerate (optional)'), { target: { value: 'Too static — add movement' } })
    fireEvent.click(screen.getByText('Regenerate ↺'))
    await waitFor(() => expect(api.regeneratePost).toHaveBeenCalledWith('camp-1', 'post-1', 'Too static — add movement'))
  })

  it('shows Approve button when post is not approved', () => {
    render(wrap(<PostEditor post={STAGE3_READY_POST} campaignId="camp-1" onClose={() => {}} />))
    expect(screen.getByText('Approve')).toBeInTheDocument()
  })

  it('Push button is disabled when post is not approved', () => {
    render(wrap(<PostEditor post={STAGE3_READY_POST} campaignId="camp-1" onClose={() => {}} />))
    expect(screen.getByText('Push →')).toBeDisabled()
  })

  it('calls approvePost when Approve clicked', async () => {
    render(wrap(<PostEditor post={STAGE3_READY_POST} campaignId="camp-1" onClose={() => {}} />))
    fireEvent.click(screen.getByText('Approve'))
    await waitFor(() => expect(api.approvePost).toHaveBeenCalledWith('camp-1', 'post-1'))
  })

  it('shows "Approved ✓" badge when post.approved is true', () => {
    render(wrap(<PostEditor post={{ ...STAGE3_READY_POST, approved: true }} campaignId="camp-1" onClose={() => {}} />))
    expect(screen.getByText('Approved ✓')).toBeInTheDocument()
  })

  it('Push button is enabled when post.approved is true', () => {
    render(wrap(<PostEditor post={{ ...STAGE3_READY_POST, approved: true }} campaignId="camp-1" onClose={() => {}} />))
    expect(screen.getByText('Push →')).not.toBeDisabled()
  })

  it('does not show Push button when post already has a bufferId', () => {
    render(wrap(<PostEditor post={{ ...STAGE3_READY_POST, approved: true, bufferId: 'buf-123' }} campaignId="camp-1" onClose={() => {}} />))
    expect(screen.queryByText('Push →')).not.toBeInTheDocument()
  })
})

describe('PostEditor — Approve gate', () => {
  it('disables Approve when editorStatus is not READY', () => {
    render(wrap(<PostEditor post={STAGE2_POST} campaignId="camp-1" onClose={() => {}} />))
    expect(screen.getByText('Approve')).toBeDisabled()
  })

  it('enables Approve when editorStatus is READY', () => {
    render(wrap(<PostEditor post={STAGE3_READY_POST} campaignId="camp-1" onClose={() => {}} />))
    expect(screen.getByText('Approve')).not.toBeDisabled()
  })
})
```

- [ ] **Step 2: Run — verify it fails.**

```bash
cd frontend && npx vitest run src/components/posts/PostEditor.test.tsx
```

Expected failure: `Unable to find an element with the text: Regenerate ↺` and the "disables Approve" test failing (Approve currently only checks `approveMutation.isPending`).

- [ ] **Step 3: Implement.**

In `frontend/src/components/posts/PostEditor.tsx`:

Add `feedback` state (with the other `useState` declarations):

```tsx
  const [feedback, setFeedback] = useState('')
```

Add `regenerateMutation` (after `sendToEditorMutation`):

```tsx
  const regenerateMutation = useMutation({
    mutationFn: () => api.regeneratePost(campaignId, initialPost.id, feedback.trim() || undefined),
    onSuccess: (updated) => {
      setLivePost(updated)
      setFeedback('')
      qc.invalidateQueries({ queryKey: ['posts', campaignId] })
    },
    onError: (e: Error) => alert(`Regenerate failed: ${e.message}`),
  })
```

Add the Stage 3 "Editor Agent" panel to the **left column**, right after the `PlatformPreview` div:

```tsx
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
                  </>
                )}
                {livePost.editorStatus === 'FAILED' && (
                  <p className="text-xs text-danger">Editor agent failed — try regenerating.</p>
                )}
              </div>
            )}
```

Update the footer to add the feedback input + Regenerate button (stage 3 only), and gate Approve's `disabled`:

```tsx
            {/* Footer */}
            <div className="px-6 py-4 border-t border-charcoal-100 flex items-center gap-3 shrink-0">
              <Button variant="ghost" onClick={onClose} size="sm">Cancel</Button>

              {stage === 3 && (
                <div className="flex items-center gap-2 flex-1 min-w-0">
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
                    disabled={regenerateMutation.isPending}
                  >
                    {regenerateMutation.isPending ? 'Regenerating…' : 'Regenerate ↺'}
                  </Button>
                </div>
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
```

- [ ] **Step 4: Run — verify it passes.**

```bash
cd frontend && npx vitest run src/components/posts/PostEditor.test.tsx
```

Expected: all tests pass (4 Stage1 + 3 Stage2 + 9 Stage3 + 2 Approve-gate = 18 total).

- [ ] **Step 5: Run the full frontend suite.**

```bash
cd frontend && npx vitest run
```

Expected: all green.

- [ ] **Step 6: Commit.**

```bash
git add frontend/src/components/posts/PostEditor.tsx frontend/src/components/posts/PostEditor.test.tsx
git commit -m "$(cat <<'EOF'
Add Stage 3 (Review) to PostEditor — regenerate + approve gate

Approve is now disabled until editorStatus === READY. FAILED surfaces
an error message with Regenerate as the only path forward. Completes
the 3-stage pipeline rewrite; the old manual asset-picker and
motion-prompt controls are fully removed.
EOF
)"
```

---

## Self-Review

### Spec coverage checklist

| Spec item | Task(s) | Covered |
|---|---|---|
| §2 `directionBrief`, `directionAccepted`, `EditorStatus` enum, `editorPrompt`, `editorReasoning` on `Post` | 1 | Yes |
| §2 Migration backfill: `directionBrief` ← `assetNote`; `approved=true` → `directionAccepted=now()`, `editorStatus='READY'` | 1 | Yes |
| §3 `PATCH .../direction` (accept/edit, one endpoint) | 3 | Yes |
| §3 `POST .../send-to-editor` (400 without `directionAccepted`) | 4 | Yes |
| §3 `POST .../regenerate` (400 unless `READY`/`FAILED`, feedback folded in) | 5 | Yes |
| §3 `approve` 400s unless `editorStatus === 'READY'` | 6 | Yes |
| §3 `push` unchanged | — | Verified untouched; existing push route/tests unmodified |
| §4 `editorAgent.ts` — single structured decision, `submit_edit_decision` tool exactly as specced | 2 | Yes |
| §4 Backend executes decision: null asset → `READY` no job; asset set → `createVideoJob` + `PENDING` | 4 | Yes |
| §4 `pollAllPendingPosts` flips `editorStatus` alongside `videoStatus` | 7 | Yes |
| §4 Error handling: Anthropic throw / `createVideoJob` throw → `editorStatus='FAILED'` synchronously | 4 (`runEditorWorkflow`'s try/catch) | Yes |
| §5 Stage 1 read-only card, Accept/Edit, Save & Accept/Cancel | 9 | Yes |
| §5 Stage 2 Send-to-Editor button + 3s poll | 10 | Yes |
| §5 Stage 3 asset/clip preview, reasoning, prompt read-only, Regenerate+feedback, Approve→Push | 11 | Yes |
| §5 Caption/hashtags independently editable via existing `updatePost`, explicit Save | 9 | Yes |
| §5 `directionBrief` locked after Stage 1 (no reopen; only via regenerate feedback) | 9–11 | Yes — no UI path to re-edit `directionBrief` once `directionAccepted` is set |
| §5 Old asset-picker/motion-prompt textarea fully removed | 9 | Yes — full rewrite, no `selectAssetMutation`/`generateVideoMutation`/`assets` query remain |
| §6 `editorAgent.test.ts`: null-asset, asset+prompt, feedback-in-regenerate-prompt | 2 | Yes (plus a 4th: missing-motion-prompt validation) |
| §6 `campaigns.test.ts` extension: 3 gate 400s | 3, 4, 5, 6 | Yes (split across the routes that own each gate) |
| §6 `higgsfield.test.ts` extension: poll flips `editorStatus` on completion + failure | 7 | Yes |
| §6 `PostEditor.test.tsx`: one test per stage + Approve disabled until READY | 9, 10, 11 | Yes |
| §7 Out of scope (multi-asset, Remotion, burned-in captions) | — | Correctly not touched by any task |
| (not in spec, discovered during planning) `directionBrief` NOT NULL breaks `generateCampaign` and 2 existing test fixtures that create `Post` rows directly | 1b | Yes — `generate.ts` seeds it from `draft.assetNote`; `db.test.ts` and `campaigns.post-approve.test.ts` fixtures updated |

### Placeholder scan

No task contains "TBD", "similar to Task N" without full code, or commented-out stubs — every step shows the complete file/diff content being written.

### Type-consistency check across tasks

- `EditorDecision.assetFileId: string | null` (Task 2) flows unchanged into `runEditorWorkflow`'s `decision.assetFileId === null` check (Task 4) and into `Post.assetFileId: String?` (Task 1) — consistent.
- `EditorDecision.motionPrompt: string | null` (Task 2) → `runEditorWorkflow` only reads it when `assetFileId !== null` (guarded by Task 2's own validation that `motionPrompt` is non-null whenever `assetFileId` is set) → passed as `decision.motionPrompt!` to `createVideoJob(imageUrl, prompt: string)` (existing `higgsfield.ts` signature) — consistent.
- `runEditorWorkflow(postId: string, campaignId: string, userId: string, feedback?: string): Promise<Post>` (Task 4) signature is used identically by both the `send-to-editor` route (Task 4, 3-arg call) and `regenerate` route (Task 5, 4-arg call) — consistent.
- `Post.editorStatus` string-literal union (Task 1's Prisma enum) is compared via plain string equality in the approve gate (Task 6), the poll loop (Task 7), and the frontend `stage` computation (Tasks 9–11) — Prisma serializes enums as their string values over JSON, so the frontend's comparisons are consistent with the backend's enum values.
- `api.ts` methods (Task 8) — `updateDirection`'s parameter shape `{caption?, hashtags?, directionBrief?}` matches `UpdateDirectionSchema` field names and optionality exactly (Task 3); `regeneratePost(campaignId, postId, feedback?: string)` matches `RegenerateSchema`'s `{feedback?: string}` body exactly (Task 5).
- `DriveFile` type (existing `driveClient.ts`) is used identically in `EditorAgentInput.assets` (Task 2) and `runEditorWorkflow`'s `assets` variable (Task 4) — same `{id, name, mimeType, webViewLink, size?}` shape throughout.
- Task 9's `stage: 1 | 2` narrows to Task 10's `stage: 1 | 2 | 3` by replacing the same `const stage = ...` line — no leftover reference to the old 2-value type anywhere in Tasks 10–11.
- `frontend/src/components/posts/PostEditor.test.tsx` fixture chain (`BASE_POST` → `STAGE2_POST`/`STAGE2_PENDING_POST` → `STAGE3_READY_POST`/`STAGE3_FAILED_POST`) each spreads the prior fixture, so field names introduced in Task 9 (`directionBrief`, `directionAccepted`, `editorStatus`, `editorPrompt`, `editorReasoning`, `assetFileId`, `assetMimeType`) stay consistent through Tasks 10–11 without redeclaration drift.

