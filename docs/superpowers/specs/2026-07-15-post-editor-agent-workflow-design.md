# Post Editor — Direction Gate + Editor Agent Workflow — Design Spec

**Date:** 2026-07-15
**Author:** TJ Travelbee (Blue Sky Fable / Enlyt Building Technologies)
**Status:** Approved for implementation

---

## 1. Overview

Today's `PostEditor` has no real workflow — caption/hashtags/asset are freeform fields a human edits by hand, "Generate Video" is a manual Higgsfield trigger with a hand-typed prompt, and Approve/Push are gated only on a boolean flag that doesn't check whether anything was actually reviewed. There's no point where the human makes an explicit "this direction is right" decision, and no agent producing a finished candidate for review — the human is hand-operating the generation API directly.

This spec introduces a real three-stage pipeline:

```
contentAgent (existing, unchanged)
  → Post created with caption, hashtags, directionBrief
      ↓
[STAGE 1: Direction Review]  — human gate, no agent call
  Accept (as-is) or Edit → Confirm  →  directionAccepted = now()
      ↓
[STAGE 2: Editor Agent]  — new agent, single structured decision
  Input: lyricSource, songAnalysis, finalized direction, campaign's Drive asset list
  Output: chosen assetFileId (or null = caption-only), motion prompt, one-line reasoning
  Backend executes the decision via existing Higgsfield integration
      ↓
[STAGE 3: Review]  — human gate
  Regenerate (+ optional feedback) — or — Approve → Push
```

**What this replaces:** the manual asset-picker + motion-prompt textarea in `PostEditor.tsx`; the unconditional Approve/Push gate.

**What this keeps:** `contentAgent`/`arcAgent` (unchanged), the Higgsfield `createVideoJob`/`checkJobStatus`/`pollAllPendingPosts` integration (unchanged, just fed a different prompt/asset source), Buffer push (unchanged).

**Out of scope for this spec (deferred to a follow-up):** multi-asset creative range — the editor agent choosing among several Drive assets and composing a multi-clip sequence with transitions — requires Remotion (compositing/timeline) on top of Higgsfield (single-clip motion generation). Higgsfield alone cannot stitch clips or do frame-precise sequencing. This spec's editor agent picks exactly **one** asset and produces **one** clip; the multi-clip/Remotion composition layer is Spec 2, built once this single-clip pipeline is proven.

---

## 2. Data Model

```prisma
model Post {
  // ...existing fields unchanged (caption, hashtags, lyricSource, platform,
  // dayOffset, scheduledAt, assetFileId, assetMimeType, videoJobId, videoStatus,
  // videoUrl, approved, bufferId)...

  directionBrief    String       // replaces assetNote's role; user-editable creative brief
  directionAccepted DateTime?    // null = still in Stage 1
  editorStatus      EditorStatus @default(NOT_STARTED)
  editorPrompt      String?      // agent-authored Higgsfield motion prompt, read-only in UI
  editorReasoning   String?      // agent's one-line justification, shown for transparency
}

enum EditorStatus {
  NOT_STARTED
  PENDING
  READY
  FAILED
}
```

`assetFileId`/`assetMimeType` are repurposed: previously user-picked via the manual asset picker, now **agent-written** by the editor agent's decision. The manual asset-picker UI is removed.

`editorStatus` is the gate that wraps the existing `videoStatus` (which continues tracking the underlying Higgsfield job specifically). For a caption-only decision (`assetFileId === null`), `editorStatus` goes straight to `READY` with no video job at all — this covers both "the campaign folder has no usable images" and "the agent decided no image fits" with the same code path.

**Migration note:** `directionBrief` is seeded from each Post's existing `assetNote` content at migration time (same data, reframed as the editable creative brief rather than a display-only hint). Posts that already have `approved = true` under the old workflow are backfilled with `directionAccepted = now()` and `editorStatus = 'READY'` — they've already been through human review, so the new gates shouldn't retroactively block them.

---

## 3. API Routes

Added to `backend/src/routes/campaigns.ts`:

| Route | Effect |
|---|---|
| `PATCH /campaigns/:id/posts/:postId/direction` | Body: `{caption?, hashtags?, directionBrief?}`. Saves any provided fields and sets `directionAccepted = now()`. An empty body is "Accept as-is"; a body with changed fields is "Save edits & accept" — one endpoint, one state transition, matching the UI's single Confirm action. |
| `POST /campaigns/:id/posts/:postId/send-to-editor` | 400s if `directionAccepted` is null. Sets `editorStatus = PENDING`, runs the editor agent (§4), executes its decision, returns the updated post. |
| `POST /campaigns/:id/posts/:postId/regenerate` | Body: `{feedback?: string}`. 400s unless `editorStatus` is `READY` or `FAILED` (i.e. a prior attempt exists). Same execution path as send-to-editor, with feedback folded into the agent prompt. |
| `POST /campaigns/:id/posts/:postId/approve` (existing) | 400s unless `editorStatus === 'READY'`, in addition to existing checks. |
| `POST /campaigns/:id/posts/:postId/push` (existing) | Unchanged. |

---

## 4. Editor Agent

New `backend/src/agents/editorAgent.ts`, matching the existing `contentAgent.ts`/`arcAgent.ts` shape: **one structured decision, executed deterministically by backend code** — not a multi-turn tool-use loop. (Multi-turn autonomy — retrying with a different asset, iterating on its own results — is a Spec 2 concern, alongside Remotion.)

```ts
const SUBMIT_EDIT_DECISION_TOOL: Anthropic.Tool = {
  name: 'submit_edit_decision',
  input_schema: {
    type: 'object',
    properties: {
      assetFileId: { type: ['string', 'null'], description: 'Chosen Drive file ID, or null if no asset fits — caption-only post' },
      motionPrompt: { type: ['string', 'null'], description: 'Higgsfield motion prompt; required if assetFileId is set' },
      reasoning: { type: 'string', description: 'One-line justification, shown to the user for transparency' },
    },
    required: ['assetFileId', 'reasoning'],
  },
}
```

**Inputs to the agent:** `lyricSource`, `songAnalysis` (bpm, sections, hookMoment), the finalized direction (`caption`, `hashtags`, `directionBrief`), the campaign's Drive asset list (name + mimeType, images only — Higgsfield needs a still), and — on regenerate — the previous `editorPrompt` plus the user's `feedback` text, with an explicit instruction to steer away from the prior attempt. System prompt carries the same viral-best-practices framing as `contentAgent`'s `VIRAL_SYSTEM`.

**Backend executes the decision:**
- `assetFileId === null` → `editorStatus = 'READY'` immediately, no video job.
- `assetFileId` set → write `assetFileId`/`assetMimeType`/`editorPrompt`/`editorReasoning` onto the Post, call existing `higgsfield.createVideoJob()` with the agent's asset + prompt, set `videoStatus = 'PENDING'`, `editorStatus = 'PENDING'`.

**`pollAllPendingPosts` (existing, `higgsfield.ts`) — one change:** when it flips `videoStatus` to `READY`/`FAILED`, it now also flips `editorStatus` to match. This is the only place a completed video job surfaces up to the Approve gate.

**Error handling:**
- Anthropic call throws → caught in the route handler, `editorStatus = 'FAILED'` set synchronously, error message returned for the UI to display (no silent retry).
- `createVideoJob` throws immediately (bad credentials, malformed asset) → same: `editorStatus = 'FAILED'` synchronously, never left dangling in `PENDING` waiting on a job that never started.

---

## 5. UI Flow (`frontend/src/components/posts/PostEditor.tsx`)

Three visible stages, matching the pipeline exactly — this is the direct fix for "users need to understand what their options are":

**Stage 1 — Direction Review** (`directionAccepted === null`): caption/hashtags/`directionBrief` render as a **read-only card** (what the agent generated). Two buttons: **Accept** (`PATCH .../direction` with no field changes) and **Edit** (switches the card to editable textareas + **Save & Accept** / **Cancel**). Both paths end the same way — `directionAccepted` gets set, UI advances.

**Stage 2 — Send to Editor** (`directionAccepted` set, `editorStatus` is `NOT_STARTED`/`PENDING`): direction shows read-only with a **"Send to Editor Agent →"** button. On click: `POST .../send-to-editor`; UI shows "Editor agent is working…" with a spinner, polling every 3s (same pattern the existing video-status poll uses) until `editorStatus` leaves `PENDING`.

**Stage 3 — Review** (`editorStatus` is `READY` or `FAILED`):
- `READY`: shows the agent's chosen asset + rendered clip (existing `PlatformPreview`), the agent's `editorReasoning`, `editorPrompt` visible but read-only. Footer: **Regenerate** (optional feedback textarea → `POST .../regenerate`) and **Approve** → **Push** (existing, unchanged).
- `FAILED`: error message surfaced, only **Regenerate** available.

Caption/hashtags remain independently editable at any stage via the existing `updatePost` call behind a small **Save** control near those fields (explicit click, not autosave-on-keystroke) — they don't affect the editor agent's decision, so they aren't gated behind the pipeline. `directionBrief` is locked after Stage 1; if the creative direction needs to change later, that happens through Regenerate's feedback text, not by reopening the brief editor.

The old manual asset-picker and motion-prompt textarea are removed entirely.

---

## 6. Testing

- `editorAgent.test.ts` (new) — mock Anthropic tool-call response; assert the null-asset (caption-only) path, the asset+prompt path, and that feedback text is included in the regenerate prompt.
- `campaigns.test.ts` (extend) — `send-to-editor` 400s without `directionAccepted`; `approve` 400s unless `editorStatus === 'READY'`; `regenerate` 400s without a prior `READY`/`FAILED` attempt.
- `higgsfield.test.ts` (extend) — `pollAllPendingPosts` flips `editorStatus` alongside `videoStatus` on both completion and failure.
- `PostEditor.test.tsx` (extend) — one test per stage asserting the right controls render, and that Approve is disabled until `editorStatus === 'READY'`.

---

## 7. Follow-Up (Spec 2, not this spec)

- Multi-asset creative range: editor agent chooses among several Drive assets and composes a multi-clip sequence (1–5 transitions) rather than one clip.
- Remotion (via MCP) as the compositing/timeline layer on top of Higgsfield's per-clip motion generation — needed because Higgsfield has no multi-clip sequencing or frame-precise timeline control.
- Caption/lyric text burned into video, synced to `songAnalysis.sections`/`hookMoment` timestamps.
- Render hosting/infrastructure decisions for Remotion output (where renders run, storage, CDN).
