/**
 * Unit tests for lib/signal-processor.ts
 * Run: npm run test:signals
 *
 * Stream A — biased / under-reflective:
 *   Expects inAnticipatoryWindow = true
 *
 * Stream B — broad / reflective:
 *   Expects inAnticipatoryWindow = false
 */

import assert from "node:assert/strict";
import { computeSignals, type EventRow, type NodeRow } from "./signal-processor";

// ── Stream A: biased, under-reflective ────────────────────────────────────────
// Three supporting observe_world nodes; lean at 0.8; all engagement on supports;
// no undermining nodes; no observe_self or reflect_on_prediction.
//
// Expected window evaluation (formula: 0.6*|lean| + 0.4*endorseWeightedRate):
//   commitmentScore ≈ 0.6*0.8 + 0.4*(2/9) = 0.480 + 0.089 ≈ 0.569   → in (0.40, 0.75) ✓
//   biasScore       = (1+1)/(1+1+0)        = 1.0                       → > 0.60 ✓
//   disconfirmRatio = 0  (no counter-nodes)                            → < 0.30 ✓
//   rung2and4Covered = false                                           → NOT covered ✓
//   → inAnticipatoryWindow = true

const nodesA: NodeRow[] = [
  { id: "n1", edge_type: "observe_world", valence: "supports" },
  { id: "n2", edge_type: "observe_world", valence: "supports" },
  { id: "n3", edge_type: "predict_future", valence: "supports" },
];

const eventsA: EventRow[] = [
  { event_type: "lean_shift",  node_id: null, payload: { lean: 0.8 },  elapsed_ms: 5000  },
  { event_type: "endorse",     node_id: "n1", payload: null,            elapsed_ms: 10000 },
  { event_type: "endorse",     node_id: "n2", payload: null,            elapsed_ms: 15000 },
  { event_type: "dwell_start", node_id: "n1", payload: null,            elapsed_ms: 16000 },
  { event_type: "dwell_end",   node_id: "n1", payload: null,            elapsed_ms: 18000 },
  { event_type: "dwell_start", node_id: "n2", payload: null,            elapsed_ms: 19000 },
  { event_type: "dwell_end",   node_id: "n2", payload: null,            elapsed_ms: 22000 },
  { event_type: "dwell_start", node_id: "n3", payload: null,            elapsed_ms: 24000 },
  { event_type: "dwell_end",   node_id: "n3", payload: null,            elapsed_ms: 27000 },
];

const sigA = computeSignals(eventsA, nodesA);

console.log("Stream A signals:", JSON.stringify(sigA, null, 2));

assert(sigA.biasScore > 0.60,
  `biasScore should be > 0.60, got ${sigA.biasScore}`);

assert(sigA.commitmentScore > 0.40 && sigA.commitmentScore < 0.75,
  `commitmentScore should be in (0.40, 0.75), got ${sigA.commitmentScore}`);

assert(sigA.disconfirmRatio < 0.30,
  `disconfirmRatio should be < 0.30, got ${sigA.disconfirmRatio}`);

assert(sigA.rung2and4Covered === false,
  `rung2and4Covered should be false`);

assert(sigA.inAnticipatoryWindow === true,
  `Stream A should open the anticipatory window`);

console.log("✓  Stream A: inAnticipatoryWindow = true (biased / under-reflective)\n");

// ── Stream B: broad, reflective ───────────────────────────────────────────────
// Four nodes covering all four rungs; two nodes are undermining; lean at 0.3;
// engagement split evenly across supports and undermines.
//
// Expected window evaluation:
//   commitmentScore ≈ 0.6*0.3 + 0.4*(2/7) = 0.180 + 0.114 ≈ 0.294   → ≤ 0.40 ✗
//   biasScore       = (1+1)/(1+1+1+1)     = 0.5                       → ≤ 0.60 ✗
//   rung2and4Covered = true  (observe_self + reflect_on_prediction)    → covered ✗
//   → inAnticipatoryWindow = false  (all three conditions fail)

const nodesB: NodeRow[] = [
  { id: "m1", edge_type: "observe_world",         valence: "supports"   },
  { id: "m2", edge_type: "observe_self",           valence: "neutral"    },
  { id: "m3", edge_type: "predict_future",         valence: "undermines" },
  { id: "m4", edge_type: "reflect_on_prediction",  valence: "neutral"    },
];

const eventsB: EventRow[] = [
  { event_type: "lean_shift",  node_id: null, payload: { lean: 0.3 },  elapsed_ms: 3000  },
  { event_type: "endorse",     node_id: "m1", payload: null,            elapsed_ms: 8000  },
  { event_type: "endorse",     node_id: "m4", payload: null,            elapsed_ms: 13000 },
  { event_type: "dwell_start", node_id: "m3", payload: null,            elapsed_ms: 15000 },
  { event_type: "dwell_end",   node_id: "m3", payload: null,            elapsed_ms: 20000 },
  { event_type: "dwell_start", node_id: "m2", payload: null,            elapsed_ms: 22000 },
  { event_type: "dwell_end",   node_id: "m2", payload: null,            elapsed_ms: 26000 },
];

const sigB = computeSignals(eventsB, nodesB);

console.log("Stream B signals:", JSON.stringify(sigB, null, 2));

assert(sigB.rung2and4Covered === true,
  `rung2and4Covered should be true`);

assert(sigB.biasScore <= 0.60,
  `biasScore should be ≤ 0.60, got ${sigB.biasScore}`);

assert(sigB.commitmentScore <= 0.40,
  `commitmentScore should be ≤ 0.40, got ${sigB.commitmentScore}`);

assert(sigB.inAnticipatoryWindow === false,
  `Stream B should NOT open the anticipatory window`);

console.log("✓  Stream B: inAnticipatoryWindow = false (broad / reflective)\n");

console.log("All signal-processor tests passed.");
