# KAIROS Build Order

> This order reflects the redesign in `KAIROS_BUILD_UPDATE.md`. Each phase is a testable unit.
> Verify before moving on. Do not scaffold everything at once.

---

### Phase 1 — Docs (current)
Update `CLAUDE.md`, `ARCHITECTURE.md`, `BUILD_ORDER.md` to reflect the new philosophy:
- Exit at commit (not equilibrium gate)
- Contextual lean re-sampling (not persistent slider)
- Locked hypothesis + measurement spine
- Research-instrument-first stance; defer consumer track

**Done when:** docs are internally consistent and no longer reference equilibrium as an exit gate.

---

### Phase 2 — Schema reconcile + migrations
Inspect the current Supabase schema and add/migrate as needed:
- `card_events(session_id, node_id, event_type, hidden_valence, hidden_edge_type, ts)`
- `lean_samples(session_id, node_id, lean_value, ts)`
- `prompt_events(session_id, condition, trigger_type, fired_at, prompt_text, response_text, response_code)`
- `final_rationale(session_id, text, committed_at)`
- `session_outcome(session_id, equilibrium_reached, hardened_prematurely, bailed, initial_lean, final_lean)`
- `mailing_list(email, created_at)` — **no FK, no link to any session/participant data**
- Confirm all dwell/engagement events carry `node_id`

**Done when:** all tables exist and a test write/read on each succeeds.

---

### Phase 3 — Exit at commit + per-condition firing + unified end flow
- "I've reached my position" always proceeds; delete any equilibrium gate on the exit path.
- Implement per-condition firing (see `ARCHITECTURE.md` — Unified end flow):
  - `anticipatory` — fires during exploration on window detection
  - `reactive` — fires at commit intent, before final rationale
  - `random` — fires at a random point after minimum-engagement gate
  - `silent` — never fires
- Wire the unified end flow: explore → optional prompt → commit → **final rationale** → debrief.

**Done when:** all four conditions reach the final rationale page via the same path.

---

### Phase 4 — Card stream: balanced pool, hidden labels, dismiss events, contextual lean
- Card generator must always include genuinely undermining cards relative to current lean.
  `disconfirmRatio` should be able to leave 0 once an undermining card is engaged or dismissed.
- Remove `edge_type` and valence badges from all card UI — labels are backend-only.
- Log dismissals as first-class events in `card_events` (node_id, hidden_valence, hidden_edge_type, ts).
- Remove the persistent top-of-page lean slider from the explore screen.
- After each endorse/dismiss, show a compact inline re-rating → write to `lean_samples`.
- "This changes things" (weighted endorse): keep it; visibly move the inline lean re-rating
  so the participant feels it does something, but never reveal valence.

**Done when:** a biased test session produces biasScore < 1 once any undermining card is
dismissed, and a contextual lean re-rating appears after each interaction.

---

### Phase 5 — Prompt response capture
- Capture free-text response to the dissonance prompt in every firing condition.
- Write to `prompt_events(session_id, condition, trigger_type, fired_at, prompt_text, response_text, response_code)`.
- `response_code` ∈ {engaged, deflected, ignored} — may be coded offline; store raw text now.

**Done when:** a triggered session has a populated `prompt_events` row with response text.

---

### Phase 6 — Final rationale capture
- After "I've reached my position" (and after reactive prompt, if applicable): full-page
  free-text field for the participant's final written reasoning.
- Store in `final_rationale(session_id, text, committed_at)`.
- This is the primary DV. Handle it carefully: no word limit imposed, no live analysis.

**Done when:** all four condition paths produce a `final_rationale` row.

---

### Phase 7 — Debrief mirror
Reframe debrief as a gift / portrait — not a receipt of clicked cards:
- **Confirmation skew:** supporting vs undermining cards engaged (e.g. "8 supporting, 1 undermining").
- **Missing reflective rungs:** operation distribution ("predicted the future 4×, never reflected on those predictions").
- **Lean trajectory:** lean(t) over time, annotated with which card/event moved it.
- **Prompt moment:** where (if) the prompt fired and what they answered.
- Do **not** frame this as a score or approval.
- On this screen only: optional email opt-in → `mailing_list` (isolated, no FK).

**Done when:** debrief renders correctly for a completed session across all four conditions.

---

### Phase 8 — Consent edits + email opt-in
- Add researcher name/institution/contact to consent (IRB requirement).
- Confirm anonymity language is intact and unchanged.
- Wire the debrief email opt-in to `mailing_list` with no session foreign key.

**Done when:** consent page names the researcher; email opt-in stores to `mailing_list` only.

---

### Phase 9 — Dark-theme / readability pass
- Body text high-contrast (~90% white on near-black).
- Fix low-contrast gray-on-dark on `/consent` and `/onboard` — currently unreadable.
- One restrained accent color for state only (active/selected/prompt-fired). No decorative color.
- Strip all research instrumentation from participant-facing screens.

**Done when:** all participant-facing pages pass WCAG AA contrast; no signal values or type
labels visible anywhere in the participant flow.

---

### Phase 10 — End-to-end verification
Run a biased test session:
- Endorse only supporting cards → biasScore should rise above 0.60.
- Dismiss an undermining card → disconfirmRatio should leave 0.
- Confirm `inAnticipatoryWindow` fires correctly.
- Confirm "I've reached my position" exits unconditionally.
- Confirm `final_rationale`, `prompt_events`, `lean_samples`, `session_outcome` all populated.
- Confirm `mailing_list` has no FK to session data.

**Done when:** all five condition paths (anticipatory, reactive, random, silent, + missed-
window anticipatory) produce complete, clean data rows.

---

### After Phase 10 (not before data collection)
- OSF preregistration: hypothesis, conditions, primary DV (IC), N, analysis plan.
- IRB confirmation (Section 7.4 of `KAIROS_BUILD_UPDATE.md`).
- Effect-size estimate → finalize N/arm (ballpark 64–100/arm, 256–400 total).
- Soft launch to ~10 friendly testers before public recruitment.
- Integrity hardening: attention checks, min-time gate, duplicate detection, bot screening.

---

### Do NOT build in v1
- Live IC scoring (offline only).
- Bayesian/probabilistic signal estimator (keep rule-based — more defensible and legible).
- Wearable / arousal integration.
- Any consumer/viral/sharing features.
