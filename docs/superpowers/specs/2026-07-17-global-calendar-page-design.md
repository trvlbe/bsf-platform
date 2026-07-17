# Global Calendar Page — Design Spec

**Date:** 2026-07-17
**Author:** TJ Travelbee (Blue Sky Fable / Enlyt Building Technologies)
**Status:** Approved for implementation

---

## 1. Overview

The sidebar has always had a "CALENDAR" nav item pointing at `/calendar` — but that route was never built, so clicking it produces React Router's default 404 error page. This spec builds the page it was always meant to reach: a cross-campaign, date-based calendar showing every scheduled post across all of the user's campaigns.

**What this replaces:** nothing functionally — `/calendar` currently 404s. The existing per-campaign calendar (`pages/Campaign/CalendarView.tsx`, a relative day-offset list scoped to one campaign) is unrelated and untouched; this is a new, separate top-level page.

**Out of scope for this spec:** cross-tenant / cross-org "super user" access. Today every backend query is scoped to `userId` with no roles/permissions concept at all — that's a separate, security-sensitive subsystem to design later once there's an actual multi-tenant need. This spec's calendar shows only the logged-in user's own campaigns.

---

## 2. Backend

One new read-only endpoint:

**`GET /api/posts`** — new top-level route (not nested under `campaignsRouter`, to avoid Express route-ordering conflicts with `/:id`). Scoped via `campaign.userId` — same 404-never-403 posture as every other route in this app. No query params; returns every post across all of the user's campaigns in one shot, each with its parent campaign's `{id, title, artist}` attached:

```ts
// backend/src/routes/posts.ts
postsRouter.get('/', async (req, res) => {
  const posts = await prisma.post.findMany({
    where: { campaign: { userId: req.session.userId! } },
    include: { campaign: { select: { id: true, title: true, artist: true } } },
    orderBy: { scheduledAt: 'asc' },
  })
  res.json(posts)
})
```

Mounted in `app.ts` alongside `campaignsRouter`, behind the same `requireAuth` middleware.

---

## 3. Frontend

**New files:**

| File | Responsibility |
|---|---|
| `pages/Calendar/index.tsx` | Page: owns displayed-month state, filter state (campaigns/platforms/statuses/search), fetches `api.getAllPosts()` once via TanStack Query, computes the filtered post set and day-grouping. |
| `pages/Calendar/CalendarToolbar.tsx` | Search input, platform toggle chips, status dropdown, campaign multi-select, prev/next/today month navigation. |
| `pages/Calendar/CalendarGrid.tsx` | Month grid (7×N weeks) — renders one `CalendarDayCell` per date, including leading/trailing days from adjacent months. |
| `pages/Calendar/DayPostsPanel.tsx` | Slide-out panel (visually consistent with `PostEditor`'s pattern) listing a clicked day's matching posts — campaign name, platform badge, caption snippet, derived status. Clicking a post opens the existing `PostEditor` on top. |
| `lib/monthGrid.ts` | Pure function: `buildMonthGrid(year: number, month: number): Date[][]` — returns weeks of dates for a given month, including adjacent-month days needed to fill the grid. Weeks start on **Sunday** (no existing calendar convention in this app to match, and this is a US-based team). |
| `lib/platformStyles.ts` | Extracted `PLATFORM_ICONS`/`PLATFORM_COLORS` constants, currently duplicated-in-waiting inside `CalendarView.tsx` — this file becomes the single source, and `CalendarView.tsx` is updated to import from it instead of defining its own copies. |

**Modified files:**
- `frontend/src/lib/api.ts` — add `getAllPosts: () => req<any[]>('/posts')`.
- `frontend/src/router.tsx` — add `{ path: '/calendar', element: <ProtectedRoute><Calendar /></ProtectedRoute> }`.
- `frontend/src/pages/Campaign/CalendarView.tsx` — replace its local `PLATFORM_ICONS`/`PLATFORM_COLORS` with imports from `lib/platformStyles.ts` (no behavior change, dedup only).

**Status derivation** (matches the existing per-campaign view's inline logic exactly, applied consistently wherever status is needed):
```ts
const status = post.bufferId ? 'PUSHED' : post.approved ? 'APPROVED' : 'DRAFT'
```

**Filtering pipeline** (all client-side, recomputed on any filter change — no refetch):
1. Start from the full fetched post list.
2. Campaign filter: keep posts whose `campaignId` is in the selected set (default: all selected).
3. Platform filter: keep posts whose `platform` is in the selected set (default: all selected).
4. Status filter: keep posts whose derived status is in the selected set (default: all selected).
5. Search: case-insensitive substring match against `caption` OR `lyricSource` (empty search = no filtering).
6. Group the surviving posts by calendar day (`scheduledAt` truncated to a local date) — this grouping drives both the grid's per-day dots and the day panel's post list.

**Day cell rendering:** one small colored dot per matching post that day (color = platform, from `platformStyles.ts`), plus nothing else — clicking the day opens `DayPostsPanel`. A day with zero matching posts is non-interactive (no dot, click does nothing). Today's date cell gets a visual highlight (border/background), the same treatment the per-campaign view gives day-0/"DROP".

**Empty states:**
- No campaigns at all → grid renders normally (fully empty) with a banner: "No campaigns yet — create one to see it here."
- Filters active but nothing matches the visible month → grid renders fully empty; toolbar shows an active-filter indicator (e.g., a "Filters active" badge or highlighted filter control) so empty-due-to-filtering reads differently from empty-due-to-no-data.

**Loading/error handling:** standard TanStack Query `isLoading`/`isError` — centered spinner while loading (matches `CampaignDetail`'s existing pattern), plain inline error text on failure (matches this app's existing error-handling depth elsewhere — no retry UI is invented here since none of the other pages have one either).

---

## 4. Testing

- `backend/src/tests/posts.test.ts` (new) — `GET /api/posts` returns only the requesting user's posts (a second user's campaigns/posts are excluded), includes the attached `campaign {id, title, artist}` on each post, returns `[]` for a user with no campaigns.
- `frontend/src/lib/monthGrid.test.ts` (new) — correct week count for a given month, correct leading/trailing adjacent-month days, correct behavior for a month starting or ending mid-week.
- `frontend/src/pages/Calendar/Calendar.test.tsx` (new) — posts render as dots on the correct days; each filter (campaign/platform/status) correctly narrows the visible dots; search narrows correctly; clicking a day opens `DayPostsPanel` with exactly that day's matching posts; clicking a post in the panel opens `PostEditor`.

---

## 5. Follow-Up (explicitly out of scope for this spec)

- Cross-tenant / cross-org "super user" view — requires a roles/permissions model on `User` (none exists today) and new admin-scoped API routes. Separate design effort once there's a real second tenant to design against.
- Server-side date-range filtering for `GET /api/posts` — revisit if the fetch-everything approach becomes slow as campaign/post volume grows; not needed at current scale.
