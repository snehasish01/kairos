# KAIROS — Build Update Instructions

> Hand this whole file to Claude Code. It is a changeset, not a rebuild. It supersedes
> earlier design decisions where they conflict. **Read Section 0 before changing code** —
> several of these changes invert prior behavior on purpose, and the old `CLAUDE.md` /
> design docs encode the *old* philosophy. Update those docs first (Section 1) so the
> project's source of truth stops contradicting itself.

---

## Glossary (so nothing below is undefined)

- **IV (independent variable)** — what we deliberately vary: *when the dissonance prompt fires*. Four levels: anticipatory, reactive, random, silent. Assigned once at registration.
- **DV (dependent variable)** — what we measure as the outcome: *the quality of the participant's final written reasoning*, scored as integrative complexity.
- **IC (integrative complexity)** — an established psychology measure (Suedfeld & Tetlock) of how someone reasons: **differentiation** (holds more than one consideration) + **integration** (connects/reconciles them). This is the primary DV. Scored **post-hoc, offline**, not live in the app.
- **Mediator** — the in-between step the effect runs *through*: genuine engagement with the prompt. Tracked as engaged / deflected / ignored.

---

## 0. What changed and why (read first)

The project drifted into a working pipeline that lost its purpose. Re-anchor:

- **ACD is the contribution** — a single self-referential dissonance prompt fired in the *anticipatory window* (position forming, not yet locked), holding the participant to **their own** prior stance. **FlexMind** (CMU, arXiv:2509.12408) is the *substrate* we explore on, not our novelty.
- **The 4-arm experiment IS the paper.** Timing is the only new knob. Everything in the UI exists to isolate that one comparison cleanly. Build the **research instrument**, not a consumer/viral product. Defer all "make it delightful/shareable" work.
- **Two prior behaviors are now reversed:**
  1. **Exit is no longer gated on reflective equilibrium.** Equilibrium becomes a *recorded outcome*, never a gate. Everyone reaches debrief.
  2. **The persistent lean slider is removed.** Lean is re-sampled contextually after each engagement instead.

### The locked hypothesis
> Final reasoning quality (integrative complexity of the written rationale, blind-coded, independent of the trigger signals) is **higher when the self-referential dissonance prompt fires in the anticipatory window** than when the same prompt fires reactively, randomly, or never.
> - Load-bearing contrast: **anticipatory vs reactive.**
> - Mediator: **genuine engagement with the prompt.**
> - The prompt **text is identical across conditions**; only the *timing* differs. Do not vary wording by condition — that confounds the only variable we care about.

---

## 1. Update the source-of-truth docs FIRST

Before touching app code, update `CLAUDE.md` and any `docs/ARCHITECTURE.md`, `docs/BUILD_ORDER.md` to reflect Section 0 and the rest of this file. Specifically:
- Replace any "exit = reflective equilibrium gate" language with "exit = commit; equilibrium is a recorded outcome."
- Remove references to a persistent lean slider; document contextual lean re-sampling.
- Add the locked hypothesis + measurement spine (Section 6) as a top-level doc.
- Note the research-instrument-first stance and the deferred consumer track.

---

## 2. Exit & trigger logic

**2.1 Exit at commit, universal completion.**
- The "I've reached my position" button **always** proceeds. No signal threshold may block it. Delete/disable any equilibrium gate on the exit path.
- Equilibrium is computed and **stored as outcome data**, not enforced. Record per session: `equilibrium_reached` (bool), `hardened_prematurely` (bool), `bailed` (bool, e.g. tab-closed before commit).

**2.2 Per-condition firing (the one prompt fires at most once; zero for silent):**
- `anticipatory` — fires during exploration when the window is detected from live signals.
- `random` — fires during exploration at a random point after a minimum-engagement gate.
- `silent` — never fires.
- `reactive` — fires **at commit intent**: participant clicks "I've reached my position" → prompt fires → participant responds → continue to final rationale.

**2.3 Unified end flow (all conditions land the same way):**
```
explore (endorse/dismiss cards, lean re-sampled per engagement)
  → [anticipatory/random fire here if window/point hit]
  → "I've reached my position"
  → [reactive fires the prompt here; participant responds]
  → FINAL RATIONALE capture (free text)   ← the IC-scored DV, same point for all arms
  → debrief / mirror
```
The final rationale is **always** written after any prompt has fired, at the same fixed point, so the DV is comparable across all four arms.

---

## 3. The card stream & engagement (this is also the logs fix)

The stuck signals (`biasScore` pinned at 1, `disconfirmRatio` stuck at 0) are **not a counting bug** — the card pool was all `supports`/`neutral`, so there was nothing disconfirming to engage with. Fix the stream, the signals heal.

**3.1 Balanced candidate pool.** The card generator must produce genuinely **undermining** cards relative to the participant's *current* lean, not only supporting ones. Maintain a minimum availability of undermining candidates at all times so `disconfirmRatio` can actually move. (Undermining = cuts against where they currently lean, re-evaluated as lean shifts.)

**3.2 Hide the type labels from the participant.** Do **not** show `supports/undermines/neutral` or `observe_world/observe_self/predict_future/reflect_on_prediction` on cards. Typing stays **backend-only**, LLM-assigned. Showing it invites gaming and contaminates natural engagement.

**3.3 Dismissals are first-class events.** Track dismiss as its own logged event (not the silence around an endorse). Dismissing an (hidden-)undermining card is avoidance and is diagnostic. Log: `node_id`, hidden `valence`, hidden `operation`, timestamp.

**3.4 Contextual lean re-sampling.** Remove the persistent top slider. After each endorse/dismiss, show a **compact inline** "where do you stand now?" re-rating tied to that event. Store `lean_samples(session_id, node_id, lean_value, ts)`. This yields lean(t) tied to specific evidence events — including the money signal: *dismissed an undermining card AND lean hardened* = premature locking caught in the act.

**3.5 "This changes things" (weighted endorse) — reframed.** Keep it, but its meaning is now: *the participant's own flag that a card materially moved them* (they don't see valence). Backend records it weighted **and** records the hidden valence of the card it landed on. Interpretation is backend-only: "this changes things" on a hidden-undermining card = genuine disconfirming update (the good signal); plain endorses on supporting cards while dismissing undermining ones = confirmation/avoidance. Make the weighted endorse visibly move the lean re-rating so the participant feels it does something — but never reveal valence.

---

## 4. The dissonance prompt response (the mediator — must be captured)

- Capture the participant's free-text **response** to the prompt in every condition where it fires.
- Store: `prompt_events(session_id, condition, trigger_type, fired_at, prompt_text, response_text, response_code)`.
- `response_code` ∈ {engaged, deflected, ignored}. This may be coded post-hoc (offline, like IC) — store the raw `response_text` cleanly regardless. The effect is hypothesized to run *through* this, so it cannot be missing.

---

## 5. Debrief / the mirror (stop rendering a stack of clicked cards)

The current "reasoning graph" is a receipt. The data model already contains a portrait — draw that instead:
- **Confirmation skew:** supporting vs undermining cards engaged (e.g. "8 supporting, 1 undermining").
- **Missing reflective rungs:** operation distribution — e.g. "predicted the future 4×, never reflected on those predictions."
- **Lean trajectory over time:** lean(t) plotted, with the moment it moved and *what* moved it (which card/event).
- **The prompt moment:** where (if) the prompt fired and how they answered.
- Frame the debrief as a **gift / mirror** ("here's the shape of how you reasoned"), not a score or approval.

Also on this screen: capture the **email opt-in** (Section 7.3) — separate and optional.

---

## 6. Measurement spine (add as a doc; drives schema + analysis)

- **IV:** prompt timing — 4 conditions, assigned at registration, system simply obeys the assigned condition.
- **Primary DV:** integrative complexity of the final written rationale. **Scored offline, post-hoc** — the app only needs to store the rationale text cleanly. Do **not** build live IC scoring into the app.
- **Coding pipeline (offline, separate script/doc):** LLM codes IC, **human verifies a blind subsample** (verify-the-model, not code-from-scratch), report agreement statistic. Code **blind to condition**.
- **Mediator:** prompt engagement (engaged/deflected/ignored).
- **Secondary / manipulation-check only:** the internal signals (biasScore, disconfirmRatio, coverage). These are **NOT** the primary DV — using them as the outcome is circular (measuring our own thermostat). Report them descriptively / as manipulation checks only.
- **Analysis:** preregistered confirmatory test of anticipatory vs reactive on IC, plus a preregistered mediation model (timing → engagement → IC).

---

## 7. Consent, ethics & data integrity (do not get this wrong)

**7.1 Add the researcher to consent.** Add a line: "This study is conducted by [Snehasish — full name] at [institution]. Questions: [contact]." (Credibility + standard IRB requirement.)

**7.2 Keep the research session ANONYMOUS.** The consent's anonymity promise stays true. The session collects no name/email/identifying info linked to responses. Do not weaken this — anonymous behavioral data is what keeps the study publishable.

**7.3 Email list = SEPARATE, optional, decoupled.** On the debrief screen only, offer: "Want to hear about future studies? Leave your email — stored separately and never linked to your responses." Store in a standalone table `mailing_list(email, created_at)` with **no `session_id`, no foreign key, no link of any kind** to session/response/participant data. This is non-negotiable: merging it breaks the anonymity promise and changes the IRB category.

**7.4 (Flag, not a code task)** Confirm IRB sign-off is in place before live recruitment, given target venues (IUI/CHI/CSCW). Not my call to make — confirm with the institution.

---

## 8. Schema changes (confirm against current schema; add/migrate as needed)

Do not assume the existing schema — inspect it, then reconcile:
- `card_events`: event_type (endorse | endorse_weighted | dismiss), node_id, hidden valence, hidden operation, ts.
- `lean_samples`: session_id, node_id, lean_value, ts.
- `prompt_events`: as in Section 4.
- `final_rationale`: session_id, text, committed_at.
- `session_outcome`: equilibrium_reached, hardened_prematurely, bailed, initial_lean, final_lean.
- `mailing_list`: email, created_at — **isolated, no FKs** (Section 7.3).
- Ensure dwell/engagement events carry `node_id` (prior bug).

---

## 9. Design / dark-theme pass (tasteful, not just dim)

- Body text high-contrast (~90% white on near-black). Fix the low-contrast gray-on-black on `/consent` and `/onboard` first — those are currently unreadable.
- One restrained accent color, used only for state (active/selected/fired). Avoid decorative color.
- Strip research instrumentation out of the participant's face. The participant's job is: explore → endorse/dismiss → (maybe) one prompt → commit → write rationale → see mirror. Nothing else should be visible to them.
- (If a design-token reference helps, follow the project's `frontend-design` conventions; keep it minimal and consistent across screens.)

---

## 10. Do NOT (guardrails so CC doesn't "helpfully" undo these)

- Do **not** reinstate an equilibrium exit gate. Exit is at commit, always.
- Do **not** show card type/valence labels to participants.
- Do **not** make the primary outcome depend on internal trigger signals (circularity).
- Do **not** vary the prompt **text** by condition — only timing varies.
- Do **not** link the email list to any response/session data.
- Do **not** build live IC scoring into the app — it's offline.
- Do **not** weaken the consent anonymity statement.

---

## 11. Open items to finalize (not CC code tasks — decisions still owed)

- **Effect size → N.** 4-arm, between-subjects, powered on the anticipatory-vs-reactive contrast (two-tailed α=.05, power=.80). N/arm depends on the assumed effect: ballpark ~64/arm at d≈0.50, ~100/arm at d≈0.40 → ~256–400 total. **Finalize the effect-size estimate** (from a pilot, the seed sessions, or comparable prompt-intervention studies) before freezing N and preregistering.
- **Exact prompt text** (single version, used across all conditions).
- **OSF preregistration** of hypothesis, conditions, primary DV, N, and analysis plan — **before** data collection.
- **IRB confirmation** (Section 7.4).

---

### Suggested build order for CC
1. Update source-of-truth docs (Section 1).
2. Schema reconcile + migrations (Section 8).
3. Exit-at-commit + per-condition firing + unified end flow (Section 2).
4. Card stream: balanced pool, hidden labels, dismiss events, contextual lean, weighted endorse (Section 3).
5. Prompt response capture (Section 4).
6. Final rationale capture (Section 2.3).
7. Debrief mirror (Section 5).
8. Consent edits + separate email opt-in (Section 7).
9. Dark-theme/readability pass (Section 9).
10. Verify the stuck-signals bug is gone end-to-end with a biased test session (biasScore should now move; disconfirmRatio should leave 0 once an undermining card is engaged or dismissed).
