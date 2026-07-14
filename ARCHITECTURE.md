# KAIROS Architecture

## The locked hypothesis

> Final reasoning quality (integrative complexity of the written rationale, blind-coded,
> independent of trigger signals) is **higher when the self-referential dissonance prompt fires
> in the anticipatory window** than when the same prompt fires reactively, randomly, or never.

- **IV:** prompt timing — 4 conditions: `anticipatory`, `reactive`, `random`, `silent`.
- **Primary DV:** IC of the final written rationale. Scored offline, post-hoc, blind to condition.
- **Mediator:** prompt engagement (engaged / deflected / ignored). Captured as raw response text.
- **Manipulation checks only:** biasScore, disconfirmRatio, coverage. Do not use these as the
  primary outcome — measuring our own thermostat is circular.

---

## The spine: a typed conviction graph

Every session, whatever the topic, builds the same abstract object. The participant's
question/conjecture is the **root**. Everything else is a typed node hanging off it.
Content is free-form + LLM-generated; **types are fixed**. We measure over types and graph
shape, never specific cards — that is what makes it simultaneously domain-portable and
instrumentable.

**Edge type (the metacognitive operation / "rung" used to reach it):**
| rung | edge_type              | meaning                                    |
|------|------------------------|--------------------------------------------|
| 1    | `observe_world`        | evidence appraisal                         |
| 2    | `observe_self`         | metacognitive monitoring (Nelson–Narens)   |
| 3    | `predict_future`       | prospection / mental simulation            |
| 4    | `reflect_on_prediction`| metacognitive calibration                  |

ACD lives at 3→4 (anticipation = predict, dissonance = reflect).

**Valence (relative to current lean):** `supports` | `undermines` | `neutral`.
Operation tells you reasoning *shape*; valence tells you *bias*. Both are backend-only —
**never shown to the participant** (see DO NOT).

---

## Layers (A–G)

**A. Entry & consent.** IRB consent → minimal demographics → **prior-position elicitation**
(lean in [-1,1] + 1–2 reasons). Non-negotiable: without the prior there is nothing to hold
them consistent *to*. Assign condition here.

**B. Topic seeding.** Participant types their conviction (or selects a preset). One validation
call (is this an explorable conviction, not a factual lookup?) seeds 2–3 initial stances. Input
becomes the graph root.

**C. Exploration engine + adaptive card generation.** Participant endorses / dismisses / adds
nodes. After each meaningful action, the card generator conditions on current graph state +
trajectory. The candidate pool must always include genuinely undermining cards relative to the
current lean — do not let it collapse to all-supporting. Card type and valence are **never
displayed to the participant**. After each endorse/dismiss, show a **compact inline lean
re-rating** ("where do you stand now?") — this replaces the persistent top-of-page slider.
Results stored in `lean_samples`.

**D. Sensing.** Append-only event log, timestamped:
`open, expand, dwell_start, dwell_end, endorse, endorse_weighted, dismiss, add_own, revisit,
lean_shift, commit_intent`.
Dismissals are **first-class events** — a dismissed undermining card is avoidance and is
diagnostic. Every event carries `node_id`, hidden `valence`, hidden `edge_type`, timestamp.

**E. Inference — the proactive trigger.** Maintain B(t) and C(t). The anticipatory window is
defined precisely below. Trigger logic is condition-aware; the same prompt text fires at the
right moment for the assigned condition.

**F. Intervention.** When the window opens AND condition permits: generate one self-referential
dissonance question grounded in prior + avoided nodes. Delivered in-canvas. Capture the free-
text response → `prompt_events`. The prompt text is **identical across all conditions** — only
timing differs.

**G. Telemetry & final capture.** After any prompt (or without one, for `silent` / missed
windows): participant clicks "I've reached my position" → unconditional exit to final rationale
page → **free-text final rationale** (the IC-scored DV, stored in `final_rationale`) → debrief
mirror. Store `session_outcome` (equilibrium_reached, hardened_prematurely, bailed,
initial_lean, final_lean). Integrity: attention checks, min-time gate, duplicate-session
detection, bot screening.

---

## Signals

```
biasScore B(t)        confirmation asymmetry: weighted dwell/endorse on supports vs undermines
commitmentScore C(t)  lean strength (60%) + hardening velocity over last N events (40%)
disconfirmRatio       counter-nodes engaged ÷ counter-nodes available
operationDist         distribution over the 4 edge types
rung2and4Covered      observe_self > 0 AND reflect_on_prediction > 0
leanVelocity          rate of lean change over recent N lean_shift events
```

These signals are **manipulation checks / mechanistic observables**, not the primary outcome.
They drive trigger timing and diagnose whether the IV was delivered cleanly. Report them
descriptively; do not use them as the dependent variable.

### Anticipatory window (the thesis, operationalized)

```
inAnticipatoryWindow =
      0.40 < commitmentScore < 0.75     // forming, not yet locked
  AND biasScore        > 0.60           // lopsided attention
  AND disconfirmRatio  < 0.30           // dodging counter-evidence
  AND NOT rung2and4Covered              // hasn't introspected/calibrated
```

The `< 0.75` clause is the entire anticipatory claim: intervene during formation, before the
lock ceiling. Reactive fires after `commit_intent`; the difference between them is the study.

### Exit = commit; equilibrium is a recorded outcome

```
// Participant clicks "I've reached my position" → always proceed.
// No signal threshold may block exit.

// Computed and stored for analysis, never enforced:
equilibriumReached =
      commitmentScore > 0.65            // lean polarized
  AND leanVelocity    < epsilon         // settled over last k actions
  AND danglingCounters ≤ 2             // few unaddressed counter-nodes
  AND (rung2and4Covered OR triggerAnswered)
```

Store per session: `equilibrium_reached`, `hardened_prematurely`, `bailed`.

### Unified end flow (same for all four arms)

```
explore (endorse/dismiss, lean re-sampled per event)
  → [anticipatory / random fires here if window / random point hit]
  → "I've reached my position"  (unconditional proceed)
  → [reactive fires the prompt here; participant responds]
  → FINAL RATIONALE  ← the IC-scored DV, same fixed point for all arms
  → debrief mirror   ← confirmation skew, lean trajectory, prompt moment
```

---

## Measurement spine

| Element | What | How |
|---|---|---|
| IV | Prompt timing (4 conditions) | Assigned at registration; system obeys |
| Primary DV | IC of final rationale | Stored as text; scored offline, blind, by coders |
| Mediator | Prompt engagement | Raw response text stored; coded offline (engaged / deflected / ignored) |
| Manipulation checks | biasScore, disconfirmRatio, coverage | Descriptive / diagnostic only |
| Coding pipeline | LLM codes IC, human verifies blind subsample | Agreement statistic reported; code blind to condition |
| Preregistered analysis | Confirmatory: anticipatory vs reactive on IC; mediation: timing → engagement → IC | OSF preregistration before data collection |

---

## Tracking conviction (contextual lean re-sampling)

Lean is triangulated from three sources:

- **Behavioral (passive):** cumulative endorse/dismiss weights; hardening = falling rate of
  opening counter-nodes; dwell collapsing onto one stance. This is `C(t)`.
- **Contextual explicit:** after each endorse/dismiss, a **compact inline re-rating** appears —
  "where do you stand right now?" Each adjustment is stored in
  `lean_samples(session_id, node_id, lean_value, ts)`, tying lean(t) to the specific evidence
  event that prompted it. This replaces the persistent top-of-page slider from the prior design.
- **Signal:** dismissed an undermining card AND lean hardened → `hardened_prematurely = true`
  (premature locking caught in the act).

Bonus result: if behavioral hardening predicts contextual lean re-ratings, the implicit measure
validates against the explicit one — publishable on its own.

---

## Schema (key tables — reconcile against Supabase before coding)

```sql
-- Engagement log
card_events(session_id, node_id, event_type, hidden_valence, hidden_edge_type, ts)
  -- event_type: endorse | endorse_weighted | dismiss

-- Contextual lean re-samples (one per endorse/dismiss)
lean_samples(session_id, node_id, lean_value, ts)

-- Prompt capture
prompt_events(session_id, condition, trigger_type, fired_at, prompt_text, response_text, response_code)

-- The IC-scored DV
final_rationale(session_id, text, committed_at)

-- Session-level outcome variables
session_outcome(session_id, equilibrium_reached, hardened_prematurely, bailed,
                initial_lean, final_lean)

-- Email opt-in: ISOLATED, no FK to any response/participant data
mailing_list(email, created_at)
```

---

## Config (one place: `lib/config.ts`)

```ts
export const CONFIG = {
  window:  { commitMin: 0.40, commitMax: 0.75, biasMin: 0.60, disconfirmMax: 0.30 },
  exit:    { commitMin: 0.65, leanVelocityEps: 0.05, maxDanglingCounters: 2 },
  random:  { minEvents: 8, fireProb: 0.05 },
  signals: { recentWindowN: 10 },
  llm:     { temperature: 0.9, maxTokensCard: 1000, maxTokensPrompt: 300 },
} as const
```

---

## DO NOT (hard guardrails)

- Do **not** reinstate an equilibrium exit gate. Exit is at commit, always.
- Do **not** show card type (`edge_type`) or valence (`supports / undermines / neutral`) to
  participants. Backend-only.
- Do **not** make the primary outcome depend on internal trigger signals (circularity).
- Do **not** vary the prompt text by condition — only timing varies.
- Do **not** link the email list to any response / session / participant data.
- Do **not** build live IC scoring into the app — it is offline.
- Do **not** weaken the consent anonymity statement.

---

## Risk to watch

Free-form topics can produce graphs too sparse to compute stable signals (vague conjecture,
3 cards, leave). Mitigate: soft minimum-engagement gate before trigger logic activates; seed
free-form sessions slightly more richly so there is enough structure to sense. The stuck-signal
bug (`biasScore` pinned at 1, `disconfirmRatio` stuck at 0) is caused by a card pool that
contains no undermining cards — fix the generator and the signals heal.
