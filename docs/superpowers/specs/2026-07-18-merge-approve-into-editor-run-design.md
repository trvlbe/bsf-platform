# Merge "Send to Editor Agent" and "Approve" — Design

## Problem

The post editor pipeline has three sequential gates: accept the Direction, send it
to the editor agent, then separately **Approve** the agent's output before Push
unlocks. From the user's perspective, clicking "Send to Editor Agent" and clicking
"Approve" are the same logical step — you already decided you want this content
published; the extra manual Approve click after a successful run adds friction
without adding real review, since the alternative to disliking the result is
Regenerate, not withholding approval.

## Behavior

A **first** editor run that finishes successfully (`editorStatus: READY`) is
approved automatically — no manual Approve click. A **Regenerate** never
auto-approves, even on success — it always lands back on a manual Approve step.
Neither path approves on `FAILED`.

Rationale for the send-vs-regenerate asymmetry: the Direction (accepted in Stage 1)
is already a reviewed, deliberate input, so the first thing the agent produces from
it can be trusted by default. A Regenerate is triggered because the user wanted
something different from what they already saw — that deviation is exactly the
moment worth a manual look before it can reach Buffer.

| Trigger | Outcome | `approved` |
|---|---|---|
| Send to Editor Agent → caption-only decision | `READY` | `true` (auto) |
| Send to Editor Agent → video decision, Higgsfield job completes | `READY` | `true` (auto) |
| Send to Editor Agent → any failure | `FAILED` | `false` |
| Regenerate → any outcome | `READY` or `FAILED` | `false` (manual Approve required on `READY`) |

## Architecture

### New field: `Post.autoApproveOnEditorSuccess`

Editor runs complete through two different code paths with two different timings:

1. **Synchronous, caption-only decision** — `runEditorWorkflow` sets
   `editorStatus: 'READY'` directly, within the same request that triggered it.
2. **Asynchronous, video decision** — `runEditorWorkflow` only reaches
   `editorStatus: 'PENDING'` (a Higgsfield video job has been kicked off) and
   returns. The actual transition to `READY`/`FAILED` happens later, inside
   `pollAllPendingPosts()` in `backend/src/lib/higgsfield.ts` — a separate poller
   with no access to anything from the original request.

Because of path 2, "should this run auto-approve on success" cannot be an
in-memory parameter passed straight through to a completion handler — it must be
persisted on the `Post` row so the poller can read it whenever it eventually marks
the post `READY`.

```prisma
model Post {
  // ...existing fields
  autoApproveOnEditorSuccess Boolean @default(false)
}
```

Migration: add the column, default `false`, no backfill needed (existing posts are
either already resolved or mid-flight and will get a fresh value on their next run).

### `runEditorWorkflow` changes (`backend/src/routes/campaigns.ts`)

Signature gains a required parameter:

```ts
async function runEditorWorkflow(
  postId: string,
  campaignId: string,
  userId: string,
  feedback?: string,
  autoApproveOnSuccess: boolean = false,
)
```

- **Start-of-run reset** (currently `{ editorStatus: 'PENDING', approved: false }`)
  becomes `{ editorStatus: 'PENDING', approved: false, autoApproveOnEditorSuccess: autoApproveOnSuccess }`.
  Persisted immediately, before any Claude/Drive/Higgsfield call — survives even a
  server restart before the poller picks the job back up.
- **Caption-only success branch** adds `approved: autoApproveOnSuccess` to its
  `editorStatus: 'READY'` update — same request, reads the in-scope parameter
  directly, no extra query.
- **Video-kickoff branch**: unchanged. Still lands at `editorStatus: 'PENDING'`;
  `approved` stays `false` from the reset.
- **Catch block** (`editorStatus: 'FAILED'`): unchanged. Never sets `approved: true`.

### Call sites

- `POST /:id/posts/:postId/send-to-editor` → `runEditorWorkflow(post.id, campaign.id, userId, undefined, true)`
- `POST /:id/posts/:postId/regenerate` → `runEditorWorkflow(post.id, campaign.id, userId, parsed.data.feedback, false)`

No guard changes needed: `send-to-editor` only requires `directionAccepted`, with
no check on `editorStatus`, but the frontend only ever renders that button in
Stage 2 — before `editorStatus` reaches `READY`/`FAILED`. Once it does, the UI
moves to Stage 3, which offers only Regenerate. So `send-to-editor` fires exactly
once per post's lifecycle in practice; every later run goes through `regenerate`,
which always passes `false`.

### `pollAllPendingPosts` changes (`backend/src/lib/higgsfield.ts`)

```ts
if (status === 'completed' && videoUrl) {
  await prisma.post.update({
    where: { id: post.id },
    data: { videoStatus: 'READY', videoUrl, editorStatus: 'READY', approved: post.autoApproveOnEditorSuccess },
  })
} else if (status === 'failed' || status === 'nsfw') {
  await prisma.post.update({ where: { id: post.id }, data: { videoStatus: 'FAILED', editorStatus: 'FAILED' } })
  // approved untouched — already false from the run's start-of-run reset
}
```

`post` here already comes from the unfiltered `findMany` at the top of the
function, so `autoApproveOnEditorSuccess` is already in hand — no extra query.

## Frontend (`frontend/src/components/posts/PostEditor.tsx`)

No logic changes. `sendToEditorMutation`'s `onSuccess` already calls
`setLivePost(updated)`, and `isApproved` already reads `livePost.approved`
directly (fixed same session, commit `95aa1df`) — the auto-approval flows through
with zero additional wiring, whether it arrives via the synchronous response or via
the polled `getPost` query while `isEditorPending`.

Copy additions to make both approval moments explicit:

1. **Stage 1 (Direction Review)**, under Accept/Edit: *"Accepting approves this
   direction to be sent to the editor agent."*
2. **Stage 2 (Send to Editor Agent)**, near the button: *"A successful result is
   automatically approved for push."*
3. **Stage 3, first-run success** (`editorStatus === 'READY' && approved`), under
   "Approved ✓": *"Auto-approved — this was the editor agent's first attempt."*
4. **Stage 3, post-regenerate** (`editorStatus === 'READY' && !approved`), above
   the manual Approve button: *"Regenerated result — review before approving."*

No button renames — "Send to Editor Agent →" keeps its label per existing
direction; the copy carries the new meaning instead of the button text.

## Testing

**Backend** (`backend/src/tests/campaigns.editor-workflow.test.ts`):
- `send-to-editor` on a caption-only decision → response has `approved: true`.
- `regenerate` on the same decision → response has `approved: false` even though
  `editorStatus` is `READY`.
- A `FAILED` outcome from either path never sets `approved: true`.

**Backend** (`backend/src/tests/higgsfield.test.ts` — no test file for
`pollAllPendingPosts` exists yet; this change is the first to need one):
- A pending post with `autoApproveOnEditorSuccess: true` that completes gets
  `approved: true`.
- A pending post with `autoApproveOnEditorSuccess: false` (mid-regenerate) that
  completes gets `approved: false`.
- A pending post that fails (`'failed'`/`'nsfw'`) never gets `approved: true`,
  regardless of the flag.

**Frontend** (`PostEditor.test.tsx`): extend the existing regenerate-clears-approval
test (added this session) with a companion case confirming the *first*
`sendToEditor` success shows "Approved ✓" and an enabled Push button with no
manual Approve click in between.

## Out of scope

Per-post asset checkboxes (curating which campaign assets the editor agent may
choose from) — a separate, previously-deferred feature. No interaction with this
change: approval semantics are orthogonal to which assets are eligible.
