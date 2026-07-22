# CLAUDE.md — BSF Web Platform

## What This Is

The Blue Sky Fable Content Agent Web Platform — a full-stack React + Express + Postgres application that replaces the file-based CLI workflow (`blue-sky-fable-agent`) with a web dashboard. TJ Travelbee uses it to manage music release campaigns, import lyrics from Google Drive, generate 29-day social media calendars powered by Claude, and push posts to Buffer.

**Related repo:** `C:\Users\TJTravelbee\blue-sky-fable-agent\` — the original CLI. The core agents (arcAgent, contentAgent) and integrations (buffer, higgsfield) were ported from there into this web app.

## Stack

| Layer | Tech |
|-------|------|
| Backend | Node.js 20 ESM, TypeScript 5 strict, Express 5, Prisma 6, Passport.js |
| AI | Anthropic claude-opus-4-8, tool use (submit_arc, submit_posts) |
| Auth | Google OAuth 2.0 via Passport (openid + email + profile + drive.readonly) |
| Storage | PostgreSQL 16 (Docker on port 5433) |
| Frontend | React 19, Vite 6, Tailwind CSS v4, React Router v7, TanStack Query v5 |
| Tests | Vitest — backend + frontend |

## First-Time Setup

Setting up on a machine that hasn't run this stack before? See
`docs/DOCKER_SETUP.md` — full step-by-step: creating `backend/.env`, where
each credential comes from, running migrations for the first time,
verifying health, and (optionally) restoring campaign data from another
machine.

## Commands

```bash
# Full stack (rebuild after ANY code change — up -d alone reuses stale images)
docker compose up -d --build

# Backend only (from backend/)
npm run dev        # tsx watch, port 4001
npm run build      # tsc
npm run start      # node dist/index.js

# Frontend only (from frontend/)
npm run dev        # Vite dev server, port 5174
npm run build      # tsc + vite build

# Database (from backend/)
npm run migrate    # prisma migrate dev
npm run generate   # prisma generate (after schema changes)
npm run seed       # seed dev data (if defined)
npm run studio     # Prisma Studio UI

# Tests
cd backend && npx vitest run
cd frontend && npx vitest run
```

## Architecture

```
bsf-platform/
  backend/
    src/
      app.ts                  ← Express app, CORS, sessions, route mounts
      index.ts                ← Server entry point (:4001)
      routes/
        auth.ts               ← Google OAuth + /auth/me + /auth/logout
        campaigns.ts          ← Campaign CRUD + /generate + /push + /posts
        drive.ts              ← GET /api/drive/doc?url=... (Drive text fetch)
        health.ts             ← GET /health
      middleware/
        requireAuth.ts        ← Session guard (401 if no userId)
      lib/
        db.ts                 ← Prisma client singleton
        passport.ts           ← Google OAuth strategy
        auth.ts               ← Session type augmentation
        driveClient.ts        ← Google Drive text fetch
        claudeLyricsParser.ts ← Claude tool-use lyrics parser
        buffer.ts             ← Buffer API v1 post push
        higgsfield.ts         ← Higgsfield job polling (DB-backed)
      agents/
        arcAgent.ts           ← Claude: campaign arc (submit_arc tool)
        contentAgent.ts       ← Claude: per-day posts (submit_posts tool)
      commands/
        generate.ts           ← Arc + content orchestration → DB
        push.ts               ← Buffer push for all unpushed posts
    prisma/
      schema.prisma           ← Source of truth for all models
  frontend/
    src/
      lib/
        api.ts                ← All API calls (BASE = '/api')
        auth.tsx              ← AuthContext + AuthProvider + useAuth
      pages/
        Login.tsx             ← Google OAuth entry point
        Dashboard.tsx         ← Metrics + campaign table
        NewCampaign.tsx       ← 3-step campaign creation form
        Campaign/
          index.tsx           ← Campaign detail (tabs: calendar | posts)
          CalendarView.tsx    ← 29-day post grid grouped by dayOffset
          PostsView.tsx       ← Posts table with click-to-edit
      components/
        layout/               ← AppShell, SideNav, TopBar
        ui/                   ← Button, MetricTile, StatusBadge
        campaigns/            ← CampaignTable, LyricsStep
        posts/                ← PostEditor (slide-out drawer)
      router.tsx              ← createBrowserRouter routes
      App.tsx                 ← AuthProvider + RouterProvider
```

## Key Design Decisions

**No filesystem campaigns:** All campaign data lives in Postgres. Zero use of `campaigns/` directories.

**Google OAuth covers both auth and Drive:** Single consent flow grants `drive.readonly` scope. The user's `accessToken` is stored in the User row and used by `driveClient.ts` to fetch Google Doc text.

**Claude lyrics parser:** `claudeLyricsParser.ts` uses Claude (`claude-opus-4-8` with tool use) to parse raw document text into structured `## Section` markdown. This is called server-side on lyrics import.

**lyricSource invariant:** Every Post row must have a non-empty `lyricSource` — an exact lyric quote, never paraphrased. Enforced by the contentAgent system prompt and `lyricSource String` (non-optional) in the Prisma schema.

**All DB queries scoped to userId:** Every `campaign.findFirst` and related query uses `where: { id, userId }`. A mismatch returns 404, never 403.

**Session-based auth:** `express-session` + `connect-pg-simple` stores `userId` in the server session. The frontend sends cookies via `credentials: 'include'`.

**Tailwind v4 CSS config:** Configured via `@theme` in `frontend/src/index.css`. No `tailwind.config.js` or `tailwind.config.ts`.

**ESM throughout:** `"type": "module"` in all `package.json`. All TypeScript relative imports use `.js` extension even in `.ts` source files.

## Ports

| Service | Port |
|---------|------|
| Backend API | 4001 |
| Frontend dev | 5174 |
| Postgres (Docker) | 5433 |

## Environment Variables

Backend `.env` (not committed):

```
DATABASE_URL=postgresql://bsf:bsf_dev@localhost:5433/bsf_platform
SESSION_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=http://localhost:4001/auth/google/callback
ANTHROPIC_API_KEY=sk-ant-...
BUFFER_ACCESS_TOKEN=...       # Bearer API key from publish.buffer.com/settings/api
BUFFER_CHANNEL_TIKTOK=
BUFFER_CHANNEL_INSTAGRAM=
BUFFER_CHANNEL_YOUTUBE=
BUFFER_CHANNEL_FACEBOOK=
HIGGSFIELD_API_KEY=
FRONTEND_URL=http://localhost:5174
PORT=4001
```

Docker Compose sets `DATABASE_URL`, `PORT`, and `FRONTEND_URL` automatically. All other keys come from `backend/.env`.

## Non-obvious Notes

- **`pollAllPendingPosts`** in `higgsfield.ts` updates the DB directly (`videoStatus`, `videoUrl`) — no filesystem writes. Call it as a background job or cron.
- **CampaignArc upsert:** The `campaignArc` table has a unique constraint on `campaignId`. Use `prisma.campaignArc.upsert` to re-generate safely.
- **`onDelete: Cascade`** on Post and CampaignArc means deleting a Campaign removes all child rows automatically.
- **Buffer push idempotent:** Posts with a non-null `bufferId` are skipped on re-push.
- **Higgsfield video flow** (if `videoEnabled`): contentAgent calls Higgsfield MCP via `client.beta.messages.create` with `mcp_servers`. Posts receive a `videoJobId`. `pollAllPendingPosts` polls until status transitions to `READY`/`FAILED`.
