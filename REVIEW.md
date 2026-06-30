# BSF Platform — Final Branch Review

**Reviewed:** 2026-06-30
**Depth:** Standard (full file read + cross-file trace)
**Scope:** All 18 implementation tasks, full branch from scratch

---

## Summary

The codebase is well-structured and architecturally sound. The core security requirement (userId scoping on all campaign/post queries) is correctly implemented throughout. ESM + `.js` extension imports are consistent. The session cookie has `httpOnly` and `sameSite: lax` configured.

There are **two bugs that will cause incorrect behavior in production** and **two security issues** that must be fixed before merge. A third security concern (plaintext token storage) is noted as a known tradeoff but should be tracked.

---

## Critical Issues

### CR-01: Session cookie missing `secure: true`

**File:** `backend/src/app.ts:659–663`

**Issue:** The session cookie is configured with `httpOnly: true` and `sameSite: 'lax'` but no `secure` flag. In a production deployment over HTTPS, the cookie will still be sent over plain HTTP if an attacker can force a downgrade, and browsers do not enforce `sameSite: lax` protections as strictly on non-secure cookies.

**Fix:**
```ts
cookie: {
  maxAge: 7 * 24 * 60 * 60 * 1000,
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
}
```

---

### CR-02: `SESSION_SECRET` fallback to hardcoded `'dev-secret'`

**File:** `backend/src/app.ts:659`

**Issue:** `secret: process.env.SESSION_SECRET || 'dev-secret'` — if `SESSION_SECRET` is absent from the production environment (misconfigured deploy, missing `.env` injection), all sessions will be signed with a public, known secret. Any attacker can forge a valid session cookie.

**Fix:** Fail fast at startup if the secret is missing in production:
```ts
const sessionSecret = process.env.SESSION_SECRET
if (!sessionSecret && process.env.NODE_ENV === 'production') {
  throw new Error('SESSION_SECRET is required in production')
}

app.use(session({
  secret: sessionSecret || 'dev-secret',
  // ...
}))
```

---

## Bugs (Must Fix Before Merge)

### BG-01: `LyricsStep` stores raw Drive text, not Claude-parsed markdown

**Files:** `frontend/src/components/campaigns/LyricsStep.tsx:2181–2188`, `backend/src/routes/campaigns.ts:1251–1270`

**Issue:** `LyricsStep` calls `api.fetchDriveDoc(docUrl)` which hits `GET /api/drive/doc` and returns raw plain text from Google Drive. This raw text is set directly as `lyricsMarkdown` state and later passed to `api.updateCampaign(campaign.id, { lyricsMarkdown })`. The Claude lyrics parser (`parseLyricsFromRawText`) is **never called** from this path.

The correct endpoint — `POST /api/campaigns/:id/lyrics` — performs both the Drive fetch and the Claude parse in one step, and is exposed as `api.importLyrics(id, docUrl)`. The `LyricsStep` component bypasses it entirely.

Consequences:
- The `lyricsMarkdown` stored in the DB is raw Google Doc plain text with no `## Section` headers.
- `parseMarkdownLyrics()` in `generate.ts` will return zero sections and zero `allLines`, causing the arc and content agents to receive empty lyrics.
- The campaign will silently generate posts with empty or hallucinated lyric content, violating the `lyricSource` invariant.

**Fix:** In `NewCampaign.tsx`, create the campaign first, then call `api.importLyrics(campaign.id, docUrl)` on the lyrics step. Alternatively, refactor `LyricsStep` to call `importLyrics` instead of `fetchDriveDoc`:

```ts
// In LyricsStep.tsx — call importLyrics, not fetchDriveDoc
const fetchMutation = useMutation({
  mutationFn: async () => {
    // campaignId must be passed as a prop after campaign is created in step 1
    const { lyricsMarkdown } = await api.importLyrics(campaignId, docUrl)
    return lyricsMarkdown
  },
  onSuccess: (md) => onLyricsChange(md),
})
```

This requires creating the campaign at the end of step 1 (before the lyrics step) rather than at the end of step 3, or splitting the flow so lyrics import happens post-creation. The backend `importLyrics` route already handles idempotency via a plain `update`, so calling it again is safe.

---

### BG-02: `POST /:id/generate` on an already-generated campaign appends duplicate posts

**File:** `backend/src/commands/generate.ts:690–737`

**Issue:** The `/generate` endpoint has no API-level guard against re-running on a campaign that already has posts. The UI gates on `status === 'DRAFT'`, but a direct API call (or a UI bug) on a `GENERATED` or `ACTIVE` campaign will append a second full set of posts without deleting the first. The `campaignArc.upsert` handles the arc correctly, but `post.createMany` accumulates.

**Fix:** Delete existing posts at the start of generation, before the arc agent runs:

```ts
// In generate.ts, after finding the campaign and before setting status to GENERATING
await prisma.post.deleteMany({ where: { campaignId } })
```

Alternatively, add a status guard at the route level:
```ts
// In campaigns.ts /:id/generate
if (!['DRAFT', 'GENERATED'].includes(campaign.status)) {
  res.status(409).json({ error: 'Campaign cannot be regenerated in current status' })
  return
}
await prisma.post.deleteMany({ where: { campaignId: campaign.id } })
```

---

## Warnings

### WR-01: `PATCH /:id/posts/:postId` — no input validation on caption/hashtags

**File:** `backend/src/routes/campaigns.ts:1308–1316`

**Issue:** `caption` and `hashtags` are read directly from `req.body` and passed to `prisma.post.update` with no schema validation. If `caption` is `undefined` or `hashtags` is a string rather than an array, Prisma will either silently no-op the field or throw a cryptic DB-level error. An attacker with a valid session can also send a caption of arbitrary length.

**Fix:** Add a Zod schema:
```ts
const UpdatePostSchema = z.object({
  caption: z.string().min(1).max(2200).optional(),
  hashtags: z.array(z.string()).optional(),
})

const parsed = UpdatePostSchema.safeParse(req.body)
if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }
```

---

### WR-02: No upper bound on `preReleaseDays` / `postReleaseDays`

**File:** `backend/src/routes/campaigns.ts:1168–1169`

**Issue:** `preReleaseDays: z.number().int().default(14)` and `postReleaseDays: z.number().int().default(14)` have no maximum. A user can submit `preReleaseDays: 500`, causing `buildPostSlots` to generate thousands of slots and triggering hundreds of sequential Claude API calls in `generateCampaign`. This is a denial-of-wallet and potential hang vector.

**Fix:**
```ts
preReleaseDays: z.number().int().min(1).max(60).default(14),
postReleaseDays: z.number().int().min(1).max(60).default(14),
```

---

## Info

### IN-01: Google OAuth `accessToken` stored in plaintext in `User` table

**File:** `backend/src/lib/passport.ts:1053–1056`, `backend/prisma/schema.prisma:389–390`

**Issue:** The user's Google Drive `accessToken` and `refreshToken` are stored as plaintext columns in the `User` row. If the database is compromised, all users' Drive tokens are exposed immediately without any additional step. This is a known tradeoff in single-user/personal apps but should be explicitly tracked.

**No immediate blocker** for a personal-use tool. If the scope ever expands to multiple users or a hosted product, column-level encryption (e.g., via application-layer AES-256 before write) should be added.

---

### IN-02: `higgsfield.ts` uses non-null assertion on optional env var

**File:** `backend/src/lib/higgsfield.ts:979`

**Issue:** `Authorization: \`Bearer ${process.env.HIGGSFIELD_API_KEY!}\`` — the `!` suppresses the TypeScript undefined warning. If `HIGGSFIELD_API_KEY` is unset, requests will send `Bearer undefined` as a header, failing silently with a 401 from the Higgsfield API rather than a clear local error.

**Fix:**
```ts
function headers() {
  const key = process.env.HIGGSFIELD_API_KEY
  if (!key) throw new Error('HIGGSFIELD_API_KEY not set')
  return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
}
```

---

## Pre-Merge Requirements

**Must fix:**
1. CR-01 — Add `secure: process.env.NODE_ENV === 'production'` to session cookie config.
2. CR-02 — Fail fast (or at minimum log a prominent warning) when `SESSION_SECRET` is absent in production.
3. BG-01 — `LyricsStep` must call `importLyrics` (which runs the Claude parser), not `fetchDriveDoc`. This is the most impactful bug: campaigns generated today will silently produce posts with empty lyric context.
4. BG-02 — `generateCampaign` must delete existing posts before re-generating, or the API route must guard against it.

**Should fix before first real campaign:**
5. WR-01 — Add Zod validation to `PATCH /:id/posts/:postId`.
6. WR-02 — Add `.max(60)` to `preReleaseDays` / `postReleaseDays`.

**Track but not blocking:**
7. IN-01 — Plaintext token storage is acceptable for personal use; re-evaluate if the platform becomes multi-tenant.

---

_Reviewed: 2026-06-30_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard + cross-file trace_
