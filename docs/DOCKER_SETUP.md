# Local Dev Environment Setup (Docker)

Step-by-step guide to bring up the full BSF Platform stack on a machine that
has never run it before. Written so a fresh Claude Code session in this repo
can follow it without prior context.

## Prerequisites

- **Docker Desktop** — installed and running before any command below. On
  Windows, `docker ps` failing with `open //./pipe/dockerDesktopLinuxEngine`
  means Docker Desktop itself isn't running yet; launch it and wait ~15-30s.
- **Git** — repo already cloned, on `main`, up to date with origin.
- Node/npm are only needed for running things outside Docker (tests, `npm
  run dev`); the Docker stack itself doesn't require a local Node install.

## 1. Create `backend/.env`

This file is **not committed** (`.gitignore`) — it must be created fresh on
every machine. Create `backend/.env` with:

```
DATABASE_URL=postgresql://bsf:bsf_dev@localhost:5433/bsf_platform
SESSION_SECRET=<any random string for local dev>
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
GOOGLE_CALLBACK_URL=http://localhost:4001/auth/google/callback
ANTHROPIC_API_KEY=
BUFFER_ACCESS_TOKEN=
PORT=4001
NODE_ENV=development
FRONTEND_URL=http://localhost:5174
SPOTIFY_CLIENT_ID=<from Spotify Developer Dashboard>
SPOTIFY_CLIENT_SECRET=<from Spotify Developer Dashboard>
HIGGSFIELD_API_KEY=<from Higgsfield dashboard>
HIGGSFIELD_API_SECRET=<from Higgsfield dashboard>
```

(`docker-compose.yml` overrides `DATABASE_URL`, `PORT`, `FRONTEND_URL` for
the containerized backend automatically — the values above matter when
running the backend outside Docker via `npm run dev`.)

**Where each credential comes from:**
- `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` — Google Cloud Console → APIs &
  Services → Credentials → the OAuth 2.0 Client ID for this app. Callback
  URL must be registered there as `http://localhost:4001/auth/google/callback`.
- `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET` — Spotify Developer Dashboard,
  the app registered for this project.
- `HIGGSFIELD_API_KEY`/`HIGGSFIELD_API_SECRET` — Higgsfield platform
  dashboard, API/developer settings.
- `ANTHROPIC_API_KEY` and `BUFFER_ACCESS_TOKEN` can be **left blank here** —
  both fall back to a per-user encrypted value set through the app's own
  Settings page (`/settings`) once logged in. Leaving them blank in `.env`
  and setting them in Settings is the normal path; only fill them in here
  if you want a shared default for all users on this machine.

**Never commit real values for any of the above.** This file stays local.

## 2. Bring up the stack

From the repo root (`bsf-platform/`):

```bash
docker compose up -d --build
```

First run pulls `node:20-alpine`, `nginx:alpine`, `postgres:16-alpine` and
builds both app images — expect a few minutes. Subsequent runs are much
faster (layer caching).

## 3. Apply database migrations

The backend container does **not** run migrations automatically on start —
this is a separate, explicit step. From `backend/` on the host (needs
`DATABASE_URL` pointing at `localhost:5433`, matching what's in `.env`):

```bash
cd backend
npx prisma migrate deploy
```

Use `migrate deploy` (not `migrate dev`) for first-time setup on a fresh
database — it applies all existing migrations non-interactively and won't
prompt about drift, since a brand-new database has no prior history to
conflict with. (`migrate dev` is what `npm run migrate` runs — fine for
day-to-day schema changes once the DB is already up to date, but only use
it after this initial `migrate deploy` has succeeded once.)

If you ever see `npx prisma migrate dev` report schema drift on this
project (this has happened before on a long-lived dev database that
accumulated manual fixes over time): **do not run `migrate reset` or any
other command that drops/recreates tables.** Instead hand-write the
migration SQL, apply it directly (`docker exec bsf-platform-postgres-1
psql -U bsf -d bsf_platform -c '...'`), then `npx prisma migrate resolve
--applied <migration-folder-name>`, then `npx prisma generate`. This has
resolved every drift incident on this project without any data loss.

## 4. Verify everything is healthy

```bash
curl -s http://localhost:4001/health          # expect {"status":"ok"}
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5174   # expect 200
docker ps --filter "name=bsf-platform" --format "table {{.Names}}\t{{.Status}}"
```

All three containers (`bsf-platform-postgres-1`, `-backend-1`, `-frontend-1`)
should show `Up`/`healthy`.

## 5. First login and Settings

Open `http://localhost:5174`, sign in with Google. On first login, set
whichever of `anthropicApiKey` / `bufferAccessToken` / `bufferChannel*` /
`higgsfieldApiKey` weren't already in `backend/.env`, in the Settings page —
these are encrypted per-user in the database, not read from `.env` once set
there.

## Restoring existing campaign data from another machine (optional)

The Postgres data lives in a Docker volume, not in git — a fresh `docker
compose up` starts with an empty database (schema only, no rows). To carry
over real campaigns/posts from another machine, dump there and restore here:

```bash
# On the source machine:
docker exec bsf-platform-postgres-1 pg_dump -U bsf -d bsf_platform -Fc -f /tmp/bsf_dump.sql
docker cp bsf-platform-postgres-1:/tmp/bsf_dump.sql ./bsf_dump.sql

# Copy bsf_dump.sql to the new machine, then, after step 3 above:
docker cp ./bsf_dump.sql bsf-platform-postgres-1:/tmp/bsf_dump.sql
docker exec bsf-platform-postgres-1 pg_restore -U bsf -d bsf_platform --clean --if-exists /tmp/bsf_dump.sql
```

## Ports

| Service | Port |
|---------|------|
| Backend API | 4001 |
| Frontend | 5174 |
| Postgres | 5433 |

## Rebuilding after code changes

`docker compose up -d --build` **always** — a bare `docker compose up -d`
reuses cached images and silently serves stale code. If a fix landed after
the most recent rebuild (e.g. a commit made between two `up -d --build`
calls in the same session), rebuild again before testing it.
