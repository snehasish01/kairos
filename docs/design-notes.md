# Design notes

## Prompt-response asymmetry between anticipatory and reactive arms

Found while adding word-count limits (2026-11-07). This is how the flow already worked; the
word-limit change did not create it, but it makes it more noticeable.

**What happens**

- **Anticipatory:** the dissonance prompt appears during exploration. The participant can
  leave it unanswered and click "I've reached my position", which goes straight to
  `/rationale` (`components/ConvictionCanvas.tsx`, `handleCommitIntent`, `if (triggered)` branch).
- **Reactive:** the prompt fires after "I've reached my position". The commit button is then
  hidden (`pendingNavToRationale`), and the participant only reaches `/rationale` after
  submitting a response (`handleDissonanceResponse`). Responding is required to finish.

**Consequences for analysis**

- "Ignored" (mediator code) can only happen in the anticipatory arm. In the reactive arm,
  every completed session has a response.
- With the prompt minimum (`MIN_WORDS_PROMPT = 25`), reactive participants must write at
  least 25 words to finish. Anticipatory participants may write none. Effort and time on task
  before the final rationale can therefore differ by arm, apart from prompt timing.
- The limits and counter UI are identical in both arms. The difference is only whether
  responding is required to move on.

**Not changed:** the flow was left as is on purpose. The minimum is only a gate on the
submit button and does not require a response anywhere it was not already required.
Handle this in the preregistration (e.g. analyse response rate by arm, define how
non-responders are treated, consider respondents-only sensitivity analyses).

## Anticipatory trigger window: who it prompts

Added 2026-11-07, after restoring the commitment-score denominator to "all recent events".

**Current formula** (`lib/signal-processor.ts`, thresholds in `lib/config.ts`):

```
commitmentScore  = min(1, 0.6·|lean| + 0.4·rate)
rate             = weighted endorsements in the last 10 events ÷ number of those events (all types)
inAnticipatoryWindow =
      0.40 < commitmentScore < 0.75
  AND biasScore > 0.60  AND  disconfirmRatio < 0.30  AND  NOT rung2and4Covered
```

`lean` is the latest `lean_shift`, or `prior_lean` before any re-rating. The check runs after
each endorse plus re-rating, and once when /explore loads.

**Who it tends to prompt.** Every event counts in the denominator, including the `open`
logged when each candidate card appears (3 per batch). So one endorse cycle adds about
5 events (endorse, lean_shift, 3 opens), and with plain endorses `rate` levels off around
0.125–0.2. Commitment is then about `0.6·|lean| + 0.05–0.08`:

- The window opens only when **|lean| ≳ 0.55**. Lower-lean participants who use plain
  endorses never reach 0.40.
- The upper limit (< 0.75, "not yet locked") practically never applies with plain endorses.
- Weighted endorses ("This changes things", weight 3) raise `rate` to as much as ~0.6. That
  can open the window at |lean| down to ~0.3, and close it at |lean| near 1.
- `rate` depends on how many events the UI logs per action. Changing the number of cards
  shown, or the logging, moves the threshold. Dev builds log each `open` twice (React Strict
  Mode), so dev numbers run lower than production.

Production-build check (`next build` + `next start`, test sessions, supporting cards only,
lean re-rated at its prior value each time):

| Prior lean | Result | commitmentScore at each check |
|---|---|---|
| 0.8 | Fired after 1st endorse | 0.530 (rate 1/8) |
| 0.4 | Did not fire after 3 endorses | 0.290 → 0.320 → 0.320 (rate levels off at 2/10) |

**This differs from the earlier denominator.** The pilot build had divided by meaningful
actions only (endorse, dismiss, add-own). That put `rate` at ~1.0 for an endorse-only
participant, so the window opened only for **|lean| ≲ 0.58**: the opposite group. Sessions
run under the two versions are not comparable on prompt receipt. `triggers.signal_scores`
has no formula-version marker, so date ranges are the only way to tell them apart.

**Analysis implication.** Whether an anticipatory participant is prompted depends strongly
on lean strength. Reactive participants are always prompted at commit. Report prompt rate by
prior lean (and by lean at trigger time) per arm, and consider controlling for |prior lean|
in the anticipatory vs reactive contrast.

**What is stored for this.**

| Needed | Where | Coverage |
|---|---|---|
| Prior lean | `sessions.prior_lean` | Every session |
| Whether the prompt fired | `sessions.trigger_fired_at` (null = never), plus a `triggers` row and a `prompt_events` row | Every session. The completed status overwrites `triggered`, but `trigger_fired_at` is kept |
| Signals at trigger time | `triggers.signal_scores` (jsonb: commitment, bias, disconfirm, rung coverage, inWindow, leanVelocity) | Fired sessions only |
| Lean at trigger time | Not stored directly. Use the last `lean_shift` in `events` before `triggers.created_at` | Recomputable |
| Signals for sessions that never fired | Not stored. Recompute offline from `events` + `nodes` with `computeSignals` (pure and deterministic), using the code version that ran | Recomputable |

Example: prompt rate by prior lean, per arm (exclude TEST rows):

```sql
select p.condition,
       width_bucket(abs(s.prior_lean), 0, 1.0001, 4) as abs_lean_bucket,  -- 1.0001 keeps |lean|=1 in bucket 4
       count(*)                                  as sessions,
       count(s.trigger_fired_at)                 as prompted,
       round(avg((s.trigger_fired_at is not null)::int), 2) as prompt_rate
from sessions s join participants p on p.id = s.participant_id
where s.prior_reasons not like 'TEST%'
group by 1, 2 order by 1, 2;
```
