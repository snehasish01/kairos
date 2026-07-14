/**
 * Unit tests for lib/trigger-engine.ts
 * Run: npm run test:trigger
 *
 * Tests shouldTrigger across all four conditions on the same synthetic base
 * stream, plus boundary cases for each.
 */

import assert from "node:assert/strict";
import { CONFIG }          from "./config";
import { computeSignals, type EventRow, type NodeRow } from "./signal-processor";
import { shouldTrigger }   from "./trigger-engine";

// ── Shared synthetic data ─────────────────────────────────────────────────────
// Mirrors Stream A from signal-processor.test.ts: biased, window-opening.

const nodes: NodeRow[] = [
  { id: "n1", edge_type: "observe_world",  valence: "supports" },
  { id: "n2", edge_type: "observe_world",  valence: "supports" },
  { id: "n3", edge_type: "predict_future", valence: "supports" },
];

const baseEvents: EventRow[] = [
  { event_type: "lean_shift",  node_id: null, payload: { lean: 0.8 }, elapsed_ms: 5000  },
  { event_type: "endorse",     node_id: "n1", payload: null,           elapsed_ms: 10000 },
  { event_type: "endorse",     node_id: "n2", payload: null,           elapsed_ms: 15000 },
  { event_type: "dwell_start", node_id: "n1", payload: null,           elapsed_ms: 16000 },
  { event_type: "dwell_end",   node_id: "n1", payload: null,           elapsed_ms: 18000 },
  { event_type: "dwell_start", node_id: "n2", payload: null,           elapsed_ms: 19000 },
  { event_type: "dwell_end",   node_id: "n2", payload: null,           elapsed_ms: 22000 },
  { event_type: "dwell_start", node_id: "n3", payload: null,           elapsed_ms: 24000 },
  { event_type: "dwell_end",   node_id: "n3", payload: null,           elapsed_ms: 27000 },
];
// baseEvents.length = 9  (≥ CONFIG.random.minEvents = 8)

// Broad/reflective nodes — window closed on this stream.
const reflectiveNodes: NodeRow[] = [
  { id: "m1", edge_type: "observe_world",         valence: "supports"   },
  { id: "m2", edge_type: "observe_self",           valence: "neutral"    },
  { id: "m3", edge_type: "predict_future",         valence: "undermines" },
  { id: "m4", edge_type: "reflect_on_prediction",  valence: "neutral"    },
];
const reflectiveEvents: EventRow[] = [
  { event_type: "lean_shift",  node_id: null, payload: { lean: 0.3 }, elapsed_ms: 3000  },
  { event_type: "endorse",     node_id: "m1", payload: null,           elapsed_ms: 8000  },
  { event_type: "endorse",     node_id: "m4", payload: null,           elapsed_ms: 13000 },
  { event_type: "dwell_start", node_id: "m3", payload: null,           elapsed_ms: 15000 },
  { event_type: "dwell_end",   node_id: "m3", payload: null,           elapsed_ms: 20000 },
  { event_type: "dwell_start", node_id: "m2", payload: null,           elapsed_ms: 22000 },
  { event_type: "dwell_end",   node_id: "m2", payload: null,           elapsed_ms: 26000 },
];

const biasedSignals     = computeSignals(baseEvents,      nodes);
const reflectiveSignals = computeSignals(reflectiveEvents, reflectiveNodes);

// Verify our preconditions hold before testing the trigger engine.
assert(biasedSignals.inAnticipatoryWindow     === true,  "precondition: biased stream opens window");
assert(reflectiveSignals.inAnticipatoryWindow === false, "precondition: reflective stream closes window");

// ── ANTICIPATORY ─────────────────────────────────────────────────────────────

assert.equal(
  shouldTrigger("anticipatory", biasedSignals, baseEvents, false),
  true,
  "anticipatory fires when window is open",
);
assert.equal(
  shouldTrigger("anticipatory", reflectiveSignals, reflectiveEvents, false),
  false,
  "anticipatory stays silent when window is closed",
);
assert.equal(
  shouldTrigger("anticipatory", biasedSignals, baseEvents, true),
  false,
  "anticipatory respects alreadyTriggered guard",
);

console.log("✓  anticipatory — fires on biased stream, silent on reflective, respects guard");

// ── REACTIVE ─────────────────────────────────────────────────────────────────

const eventsWithCommit: EventRow[] = [
  ...baseEvents,
  { event_type: "commit_intent", node_id: null, payload: { lean: 0.6 }, elapsed_ms: 30000 },
];

assert.equal(
  shouldTrigger("reactive", biasedSignals, eventsWithCommit, false),
  true,
  "reactive fires when commit_intent is present",
);
assert.equal(
  shouldTrigger("reactive", biasedSignals, baseEvents, false),
  false,
  "reactive stays silent without commit_intent",
);
assert.equal(
  shouldTrigger("reactive", biasedSignals, eventsWithCommit, true),
  false,
  "reactive respects alreadyTriggered guard",
);

console.log("✓  reactive    — fires on commit_intent, silent otherwise, respects guard");

// ── RANDOM ───────────────────────────────────────────────────────────────────

// Below minEvents threshold — never fires regardless of probability.
const shortStream = baseEvents.slice(0, CONFIG.random.minEvents - 1);
assert.equal(
  shouldTrigger("random", biasedSignals, shortStream, false),
  false,
  `random silent below minEvents (${CONFIG.random.minEvents}) threshold`,
);

// Above threshold — must fire at least once in 150 trials.
// P(never fires) = (1 − 0.05)^150 ≈ 0.00035 — effectively zero.
let randomFired = false;
for (let i = 0; i < 150 && !randomFired; i++) {
  if (shouldTrigger("random", biasedSignals, baseEvents, false)) randomFired = true;
}
assert.equal(randomFired, true, "random fires at least once in 150 trials above minEvents");

assert.equal(
  shouldTrigger("random", biasedSignals, baseEvents, true),
  false,
  "random respects alreadyTriggered guard",
);

console.log(`✓  random      — silent below minEvents=${CONFIG.random.minEvents}, stochastic above, respects guard`);

// ── SILENT ───────────────────────────────────────────────────────────────────

assert.equal(
  shouldTrigger("silent", biasedSignals, baseEvents, false),
  false,
  "silent never fires on biased stream",
);
assert.equal(
  shouldTrigger("silent", reflectiveSignals, reflectiveEvents, false),
  false,
  "silent never fires on reflective stream",
);
assert.equal(
  shouldTrigger("silent", biasedSignals, eventsWithCommit, false),
  false,
  "silent ignores commit_intent",
);

console.log("✓  silent      — never fires regardless of stream or events");

console.log("\nAll trigger-engine tests passed.");
