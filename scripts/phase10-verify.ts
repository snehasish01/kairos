/**
 * Phase 10 verification — biased test session.
 *
 * Simulates a participant who:
 *   - sets a high initial lean (0.7, strongly in favor)
 *   - endorses only supporting cards (some with high weight)
 *   - dismisses every undermining card shown
 *
 * Expected: biasScore rises toward 1.0, disconfirmRatio stays at 0,
 * and the anticipatory window opens once commitmentScore enters (0.40, 0.75).
 *
 * Run: npm run test:signals  (or: npx ts-node --project tsconfig.node.json scripts/phase10-verify.ts)
 */

import assert from "node:assert/strict";
import { computeSignals, type EventRow, type NodeRow } from "../lib/signal-processor";

// ── Node pool ─────────────────────────────────────────────────────────────────
// Only nodes that are ENDORSED appear here — dismissed cards never enter the graph.
// We add nodes as the session progresses.

const allNodes: NodeRow[] = [
  { id: "s1", edge_type: "observe_world",  valence: "supports" },
  { id: "s2", edge_type: "predict_future", valence: "supports" },
  { id: "s3", edge_type: "observe_world",  valence: "supports" },
];

// ── Event stream ──────────────────────────────────────────────────────────────
// We accumulate events one at a time and print signals after each addition.

type Step = {
  label:  string;
  event:  EventRow;
  nodes?: NodeRow[];   // graph state after this step (only needed when nodes change)
};

const steps: Step[] = [
  // 1. Initial lean: strongly in favor
  {
    label: "lean_shift → 0.7",
    event: { event_type: "lean_shift", node_id: null, payload: { lean: 0.7 }, elapsed_ms: 2000 },
    nodes: [],
  },
  // 2. Endorse first supporting card
  {
    label: "endorse s1 (observe_world/supports, w=1)",
    event: { event_type: "endorse", node_id: "s1", payload: { weight: 1 }, elapsed_ms: 15000 },
    nodes: [allNodes[0]],
  },
  // 3. Dismiss an undermining card (never enters graph — hidden_valence only)
  {
    label: "dismiss (hidden_valence=undermines) #1",
    event: { event_type: "dismiss", node_id: null, payload: null, elapsed_ms: 22000,
             hidden_valence: "undermines", hidden_edge_type: "observe_world" },
    nodes: [allNodes[0]],
  },
  // 4. Endorse second supporting card
  {
    label: "endorse s2 (predict_future/supports, w=1)",
    event: { event_type: "endorse", node_id: "s2", payload: { weight: 1 }, elapsed_ms: 35000 },
    nodes: [allNodes[0], allNodes[1]],
  },
  // 5. Dismiss second undermining card
  {
    label: "dismiss (hidden_valence=undermines) #2",
    event: { event_type: "dismiss", node_id: null, payload: null, elapsed_ms: 43000,
             hidden_valence: "undermines", hidden_edge_type: "predict_future" },
    nodes: [allNodes[0], allNodes[1]],
  },
  // 6. Lean shifts higher
  {
    label: "lean_shift → 0.8",
    event: { event_type: "lean_shift", node_id: null, payload: { lean: 0.8 }, elapsed_ms: 52000 },
    nodes: [allNodes[0], allNodes[1]],
  },
  // 7. Weighted endorse ("this changes things")
  {
    label: "endorse_weighted s3 (observe_world/supports, w=3)",
    event: { event_type: "endorse_weighted", node_id: "s3", payload: { weight: 3 }, elapsed_ms: 67000,
             hidden_valence: "supports", hidden_edge_type: "observe_world" },
    nodes: allNodes,
  },
  // 8. Dismiss third undermining card
  {
    label: "dismiss (hidden_valence=undermines) #3",
    event: { event_type: "dismiss", node_id: null, payload: null, elapsed_ms: 78000,
             hidden_valence: "undermines", hidden_edge_type: "observe_world" },
    nodes: allNodes,
  },
  // 9. Dwell on an endorsed supporting node
  {
    label: "dwell_start s1",
    event: { event_type: "dwell_start", node_id: "s1", payload: null, elapsed_ms: 85000 },
    nodes: allNodes,
  },
];

// ── Run ───────────────────────────────────────────────────────────────────────

const events: EventRow[] = [];
let   currentNodes: NodeRow[] = [];

console.log("\n── Phase 10: biased session trace ────────────────────────────────────\n");
console.log(
  "step".padEnd(2), " ",
  "event".padEnd(48),
  "bias".padEnd(6),
  "commit".padEnd(8),
  "disconf".padEnd(9),
  "window",
);
console.log("─".repeat(90));

for (let i = 0; i < steps.length; i++) {
  const step = steps[i];
  events.push(step.event);
  if (step.nodes !== undefined) currentNodes = step.nodes;

  const s = computeSignals(events, currentNodes, false, 0.7);

  const bias    = s.biasScore.toFixed(3);
  const commit  = s.commitmentScore.toFixed(3);
  const disconf = s.disconfirmRatio.toFixed(3);
  const window  = s.inAnticipatoryWindow ? "✓ OPEN" : "closed";

  console.log(
    String(i + 1).padEnd(2), " ",
    step.label.padEnd(48),
    bias.padEnd(6),
    commit.padEnd(8),
    disconf.padEnd(9),
    window,
  );
}

// ── Assertions ────────────────────────────────────────────────────────────────

console.log("\n── Assertions ─────────────────────────────────────────────────────────\n");

const final = computeSignals(events, currentNodes, false, 0.7);

// biasScore: should be high (only supporting nodes in graph, no undermining endorsed)
assert(
  final.biasScore > 0.60,
  `FAIL biasScore: expected > 0.60, got ${final.biasScore.toFixed(3)}`,
);
console.log(`✓  biasScore ${final.biasScore.toFixed(3)} > 0.60`);

// disconfirmRatio: no undermining cards endorsed → ratio must be 0
assert(
  final.disconfirmRatio === 0,
  `FAIL disconfirmRatio: expected 0 (all counter-evidence dismissed, none endorsed), got ${final.disconfirmRatio}`,
);
console.log(`✓  disconfirmRatio ${final.disconfirmRatio} === 0  (avoidance correctly ignored)`);

// commitmentScore: should be in anticipatory range at some point — check the step after lean 0.8
const midEvents = events.slice(0, 6);   // after lean_shift 0.8, before weighted endorse
const midNodes  = [allNodes[0], allNodes[1]];
const midSig    = computeSignals(midEvents, midNodes, false, 0.7);
assert(
  midSig.commitmentScore > 0.40 && midSig.commitmentScore < 0.75,
  `FAIL commitmentScore mid-session: expected in (0.40, 0.75), got ${midSig.commitmentScore.toFixed(3)}`,
);
console.log(`✓  commitmentScore ${midSig.commitmentScore.toFixed(3)} in (0.40, 0.75) mid-session`);

// Window must have opened at some point
const windowOpened = steps.some((_, i) => {
  const eventsUpTo = events.slice(0, i + 1);
  const nodesAtI   = steps[i].nodes ?? currentNodes;
  return computeSignals(eventsUpTo, nodesAtI, false, 0.7).inAnticipatoryWindow;
});
assert(windowOpened, "FAIL: anticipatory window never opened during the biased session");
console.log("✓  inAnticipatoryWindow opened at least once during the session");

console.log("\n── All Phase 10 verifications passed. ─────────────────────────────────\n");
