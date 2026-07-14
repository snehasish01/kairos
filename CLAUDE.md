@AGENTS.md

# KAIROS — AI Coding Agent Instructions

## What this project is

KAIROS is a **research instrument**, not a consumer product. It runs a 4-arm between-subjects
experiment measuring how the *timing* of a self-referential dissonance prompt affects the
quality of a participant's final written reasoning. Build the instrument cleanly and stop.
Defer all "make it delightful / shareable" work — that is explicitly out of scope for v1.

## The locked hypothesis

> Final reasoning quality (integrative complexity of the written rationale, scored offline and
> blind to condition) is **higher when the self-referential dissonance prompt fires in the
> anticipatory window** than when the same prompt fires reactively, randomly, or never.
>
> - **Load-bearing contrast:** anticipatory vs reactive.
> - **Mediator:** genuine engagement with the prompt (engaged / deflected / ignored).
> - **The prompt text is identical across all four conditions.** Only *when* it fires differs.
>   Do NOT vary the wording by condition — that confounds the only variable we care about.

## IV and DV

| Role | What it is |
|---|---|
| IV | Prompt timing: `anticipatory` / `reactive` / `random` / `silent`. Assigned once at registration. |
| Primary DV | Integrative complexity (IC) of the final written rationale. Scored **offline, post-hoc, blind to condition.** |
| Mediator | Prompt engagement: engaged / deflected / ignored. Captured as raw response text; coded offline. |
| Manipulation checks | biasScore, disconfirmRatio, coverage signals — **not** the primary DV. Using internal signals as outcome is circular. |

## Non-negotiable decisions (do not revert these)

1. **Exit is at commit, always.** "I've reached my position" proceeds unconditionally. No signal
   threshold may block it. Equilibrium is computed and stored as `session_outcome.equilibrium_reached`
   for analysis, never enforced as a gate.

2. **Card type and valence are never shown to participants.** `edge_type` and
   `supports / undermines / neutral` are backend-only. Showing them invites gaming and
   contaminates natural engagement patterns.

3. **The prompt text is identical across all conditions.** Only timing differs.

4. **The email opt-in must be completely decoupled from session data.** Table:
   `mailing_list(email, created_at)` — no `session_id`, no foreign key, no link to any
   response or participant data. Breaking this weakens the anonymity promise and changes the
   IRB category.

5. **No live IC scoring in the app.** IC is scored offline by blind coders. Store the rationale
   text cleanly; the app does nothing more with it.

6. **Lean is contextual, not persistent.** After each endorse/dismiss, show a compact inline
   re-rating. Store in `lean_samples(session_id, node_id, lean_value, ts)`. There is no
   persistent top-of-page lean slider on the explore screen.

## Security rules (immutable)

- `ANTHROPIC_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` server-side only (API routes / lib).
- `supabaseAdmin` must never be exposed to the browser.
- Never log, print, commit, or expose these keys.

## Canonical docs

- `ARCHITECTURE.md` — design, signals, schema, guardrails.
- `BUILD_ORDER.md` — current phase-by-phase build plan.
- `KAIROS_BUILD_UPDATE.md` — the changeset that produced this version of the docs; archive,
  do not delete.
