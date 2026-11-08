import { CONFIG } from "./config";

// ── Input types ───────────────────────────────────────────────────────────────
// Minimal row shapes so this module has no Supabase dependency and is
// unit-testable with plain objects.

export interface EventRow {
  event_type:       string;
  node_id:          string | null;
  payload:          Record<string, unknown> | null;
  elapsed_ms:       number | null;
  hidden_valence?:  string | null;
  hidden_edge_type?: string | null;
}

export interface NodeRow {
  id:        string;
  edge_type: string | null;
  valence:   string;
}

// ── Output ────────────────────────────────────────────────────────────────────

export interface Signals {
  biasScore:            number;  // [0,1] — confirmation asymmetry in attention
  commitmentScore:      number;  // [0,1] — lean strength × endorsement hardening
  disconfirmRatio:      number;  // [0,1] — counter-nodes engaged / available
  operationDist:        Record<string, number>; // edge_type → node count
  rung2and4Covered:     boolean;
  inAnticipatoryWindow: boolean;
  equilibriumReached:   boolean;
  leanVelocity:         number;  // exposed for debugging / trigger engine
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function payloadLean(payload: Record<string, unknown> | null): number {
  const v = payload?.lean;
  return typeof v === "number" ? v : 0;
}

// ── Signal functions ──────────────────────────────────────────────────────────

/**
 * Confirmation asymmetry: fraction of engagement (endorse + dwell_start + open)
 * directed at supporting nodes vs. undermining nodes.
 *
 * Returns 0.5 when no relevant events exist (neutral baseline).
 */
function biasScore(events: EventRow[], nodes: NodeRow[]): number {
  const valenceById = new Map(nodes.map(n => [n.id, n.valence]));

  const NODE_ENGAGEMENT = new Set(["endorse", "endorse_weighted", "dwell_start", "open"]);
  let support = 0;
  let counter = 0;

  for (const e of events) {
    // Engagement with graph nodes (endorsed cards).
    if (e.node_id && NODE_ENGAGEMENT.has(e.event_type)) {
      const v      = valenceById.get(e.node_id);
      const weight = (e.event_type === "endorse" || e.event_type === "endorse_weighted") &&
                     e.payload !== null &&
                     typeof e.payload["weight"] === "number"
        ? e.payload["weight"] : 1;
      if (v === "supports")   support += weight;
      if (v === "undermines") counter += weight;
    }
    // Dismissed cards intentionally excluded from biasScore.
    // Dismissal is avoidance; adding dismissed undermining cards to `counter` would
    // lower biasScore for a maximally biased participant — the opposite of the signal's intent.
  }

  const total = support + counter;
  return total === 0 ? 0.5 : support / total;
}

/**
 * |latest lean| (60 %) + weighted endorsement rate (40 %).  "This changes
 * things" endorses (weight 3) count triple, driving faster hardening.
 * Falls back to priorLean when no lean_shift events have been recorded yet.
 */
function commitmentScore(events: EventRow[], priorLean = 0): number {
  const leanShifts  = events.filter(e => e.event_type === "lean_shift");
  const currentLean = leanShifts.length > 0
    ? Math.abs(payloadLean(leanShifts[leanShifts.length - 1].payload))
    : Math.abs(priorLean);

  const recent = events.slice(-CONFIG.signals.recentWindowN);
  const endorseWeightedSum = recent
    .filter(e => e.event_type === "endorse" || e.event_type === "endorse_weighted")
    .reduce((sum, e) => {
      const w = e.payload !== null && typeof e.payload["weight"] === "number"
        ? e.payload["weight"] : 1;
      return sum + w;
    }, 0);
  // Denominator: all events in the recent window (ARCHITECTURE.md: "over last N events").
  const endorseWeightedRate = recent.length > 0 ? endorseWeightedSum / recent.length : 0;
  console.log(
    "[KAIROS:commitment]",
    `endorseWeightedSum=${endorseWeightedSum.toFixed(3)}`,
    `| denom=${recent.length} (all recent)  rate=${endorseWeightedRate.toFixed(3)}`,
  );

  return Math.min(1, 0.6 * currentLean + 0.4 * endorseWeightedRate);
}

/**
 * Counter-evidence engagement ratio.
 * Numerator: distinct undermining nodes in the graph that received any engagement event.
 * Denominator: all undermining nodes in the graph.
 * Returns 0 when no undermining nodes have been endorsed (participant avoided all counter-evidence).
 *
 * Dismissed cards intentionally excluded: dismissal is avoidance, not engagement.
 * A biased participant who dismisses every counter-card should score 0 here (window stays open).
 */
function disconfirmRatio(events: EventRow[], nodes: NodeRow[]): number {
  const counterNodeIds = new Set(
    nodes.filter(n => n.valence === "undermines").map(n => n.id),
  );
  if (counterNodeIds.size === 0) return 0;

  const engagedNodeIds = new Set(
    events
      .filter(e => e.node_id && counterNodeIds.has(e.node_id))
      .map(e => e.node_id as string),
  );
  return engagedNodeIds.size / counterNodeIds.size;
}

/** Count of non-root nodes per edge_type. */
function operationDist(nodes: NodeRow[]): Record<string, number> {
  return {
    observe_world:         nodes.filter(n => n.edge_type === "observe_world").length,
    observe_self:          nodes.filter(n => n.edge_type === "observe_self").length,
    predict_future:        nodes.filter(n => n.edge_type === "predict_future").length,
    reflect_on_prediction: nodes.filter(n => n.edge_type === "reflect_on_prediction").length,
  };
}

/**
 * Max change in lean across the most recent N lean_shift events, divided by N.
 * Zero when fewer than 2 shift events exist (session is still early).
 */
function leanVelocity(events: EventRow[]): number {
  const leans = events
    .filter(e => e.event_type === "lean_shift")
    .slice(-CONFIG.signals.recentWindowN)
    .map(e => payloadLean(e.payload));

  if (leans.length < 2) return 0;
  return (Math.max(...leans) - Math.min(...leans)) / (leans.length - 1);
}

/**
 * Equilibrium: commitment locked, lean settled, counter-nodes addressed,
 * AND the participant has earned exit via genuine introspection OR by answering
 * the dissonance question (triggerAnswered = true).
 *
 * ARCHITECTURE.md: rung2and4Covered OR triggerAnswered (the "earned" clause).
 */
function equilibriumReached(
  events:           EventRow[],
  nodes:            NodeRow[],
  commitment:       number,
  rung2and4Covered: boolean,
  velocity:         number,
  triggerAnswered:  boolean,
): boolean {
  if (commitment <= CONFIG.exit.commitMin)      return false;
  if (!rung2and4Covered && !triggerAnswered)     return false;
  if (velocity >= CONFIG.exit.leanVelocityEps)  return false;

  const engagedIds       = new Set(events.filter(e => e.node_id).map(e => e.node_id as string));
  const counterNodes     = nodes.filter(n => n.valence === "undermines");
  const danglingCounters = counterNodes.filter(n => !engagedIds.has(n.id)).length;
  return danglingCounters <= CONFIG.exit.maxDanglingCounters;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute all running signals from the current event log and node list.
 * Both inputs come from Supabase; this function is pure and sync.
 *
 * @param triggerAnswered  Pass true when the participant has submitted a
 *   response to the dissonance question — satisfies the "earned" clause in
 *   equilibriumReached even without rung2and4Covered.
 */
export function computeSignals(
  events:          EventRow[],
  nodes:           NodeRow[],
  triggerAnswered  = false,
  priorLean        = 0,
): Signals {
  const bias       = biasScore(events, nodes);
  const commitment = commitmentScore(events, priorLean);
  const disconfirm = disconfirmRatio(events, nodes);
  const opDist     = operationDist(nodes);
  const r2r4       = opDist.observe_self > 0 && opDist.reflect_on_prediction > 0;
  const velocity   = leanVelocity(events);

  // ── Verbose window diagnostics ───────────────────────────────────────────
  const cCommitMin = commitment > CONFIG.window.commitMin;
  const cCommitMax = commitment < CONFIG.window.commitMax;
  const cBias      = bias       > CONFIG.window.biasMin;
  const cDisconf   = disconfirm < CONFIG.window.disconfirmMax;
  const cRung      = !r2r4;
  console.log(
    "[KAIROS:window]",
    `commit=${commitment.toFixed(3)} (>${CONFIG.window.commitMin}?${cCommitMin} <${CONFIG.window.commitMax}?${cCommitMax})`,
    `| bias=${bias.toFixed(3)} (>${CONFIG.window.biasMin}?${cBias})`,
    `| disconf=${disconfirm.toFixed(3)} (<${CONFIG.window.disconfirmMax}?${cDisconf})`,
    `| r2r4=${r2r4} (!r2r4?${cRung})`,
    `| inWindow=${cCommitMin && cCommitMax && cBias && cDisconf && cRung}`,
  );

  const inWindow = cCommitMin && cCommitMax && cBias && cDisconf && cRung;

  const equilibrium = equilibriumReached(
    events, nodes, commitment, r2r4, velocity, triggerAnswered,
  );

  return {
    biasScore:            bias,
    commitmentScore:      commitment,
    disconfirmRatio:      disconfirm,
    operationDist:        opDist,
    rung2and4Covered:     r2r4,
    inAnticipatoryWindow: inWindow,
    equilibriumReached:   equilibrium,
    leanVelocity:         velocity,
  };
}
