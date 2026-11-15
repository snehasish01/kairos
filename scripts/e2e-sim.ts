/**
 * End-to-end simulation: 4 sessions across 2 topics.
 * Hits real API endpoints on localhost:3000.
 * Reports pass/fail for every step and DB state after completion.
 *
 * Run: npx ts-node --project tsconfig.node.json scripts/e2e-sim.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path   from "path";
import { assertTestDatabase } from "./lib/test-db-guard";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
assertTestDatabase("e2e-sim.ts");

const BASE = "http://localhost:3000";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function api(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body:    body ? JSON.stringify(body) : undefined,
  });
  let data: unknown;
  try { data = await res.json(); } catch { data = null; }
  return { ok: res.ok, status: res.status, data };
}

function pass(label: string, detail?: string) {
  console.log(`  ✓ ${label}${detail ? `  (${detail})` : ""}`);
}
function fail(label: string, detail?: string) {
  console.log(`  ✗ FAIL: ${label}${detail ? `  → ${detail}` : ""}`);
}
function check(ok: boolean, label: string, detail?: string) {
  ok ? pass(label, detail) : fail(label, detail);
  return ok;
}

// ── Simulation scenarios ──────────────────────────────────────────────────────

interface Sim {
  label:        string;
  topicTitle:   string;
  priorLean:    number;
  priorReasons: string;
  actions: Array<{
    type:       "endorse" | "dismiss";
    valence:    "supports" | "undermines" | "neutral";
    edgeType:   "observe_world" | "observe_self" | "predict_future" | "reflect_on_prediction";
    leanAfter:  number;
  }>;
  submitRationale: string;
}

const TOPIC_MAP: Record<string, string> = {
  "social_media":   "73283ee6-393c-4b5b-9b4d-a141920b4681",
  "remote_work":    "5796089d-583f-4405-8e4b-24942e1eeac6",
  "ai_jobs":        "c48d3afd-1f0b-413b-9d37-67c63a545611",
  "screen_time":    "ee694603-81ae-4088-8d3a-b4b1e370a545",
};

const SIMS: Sim[] = [
  {
    label:        "Anticipatory — high lean, mostly endorsing supporting",
    topicTitle:   "Social media does more harm than good",
    priorLean:    0.72,
    priorReasons: "Teenagers are comparing themselves to unrealistic standards online and it is wrecking their self-esteem",
    actions: [
      { type: "endorse", valence: "supports",   edgeType: "observe_world",          leanAfter: 0.78 },
      { type: "endorse", valence: "supports",   edgeType: "observe_self",           leanAfter: 0.80 },
      { type: "dismiss", valence: "undermines", edgeType: "predict_future",         leanAfter: 0.80 },
      { type: "endorse", valence: "supports",   edgeType: "predict_future",         leanAfter: 0.82 },
    ],
    submitRationale:
      "After exploring both sides, I remain convinced that social media platforms are net negative for most users. The comparison culture, algorithmic amplification of extreme content, and displacement of real-world social skills all compound each other. Even granting that some people use it well, the median outcome is negative.",
  },
  {
    label:        "Reactive — moderate lean, engages counter-evidence before committing",
    topicTitle:   "Remote work is better for productivity than office work",
    priorLean:    0.45,
    priorReasons: "I do my best work when I can control my environment and eliminate commute stress",
    actions: [
      { type: "endorse", valence: "supports",   edgeType: "observe_world",          leanAfter: 0.50 },
      { type: "endorse", valence: "undermines", edgeType: "predict_future",         leanAfter: 0.42 },
      { type: "endorse", valence: "neutral",    edgeType: "reflect_on_prediction",  leanAfter: 0.44 },
      { type: "endorse", valence: "supports",   edgeType: "observe_self",           leanAfter: 0.52 },
    ],
    submitRationale:
      "I started moderately in favor of remote work and I hold that position still, but with more nuance. The collaboration and mentorship costs are real and the evidence from pilots is weaker than I assumed for certain roles. I now think the case depends heavily on role type — individual-contributor roles benefit more than collaborative design work.",
  },
  {
    label:        "Anticipatory — low lean initially, opens to counter-evidence",
    topicTitle:   "AI will eliminate more jobs than it creates over the next 20 years",
    priorLean:    0.28,
    priorReasons: "Technology historically creates new jobs even as it disrupts old ones",
    actions: [
      { type: "endorse", valence: "supports",   edgeType: "observe_world",          leanAfter: 0.35 },
      { type: "endorse", valence: "supports",   edgeType: "predict_future",         leanAfter: 0.40 },
      { type: "endorse", valence: "undermines", edgeType: "observe_world",          leanAfter: 0.36 },
      { type: "dismiss", valence: "supports",   edgeType: "observe_self",           leanAfter: 0.36 },
    ],
    submitRationale:
      "My initial skepticism about AI job displacement was based on historical analogies that may not hold for this wave. The pace and breadth of AI capability is qualitatively different. I moved meaningfully toward believing net displacement is more likely, though I still think the timeline depends on regulation and retraining investment.",
  },
  {
    label:        "Reactive — very high lean, minimal engagement with counter-evidence",
    topicTitle:   "Parents should limit screen time for kids under 12",
    priorLean:    0.88,
    priorReasons: "Excessive screen time is clearly linked to attention problems and disrupted sleep in children",
    actions: [
      { type: "endorse", valence: "supports",   edgeType: "observe_world",          leanAfter: 0.90 },
      { type: "dismiss", valence: "undermines", edgeType: "predict_future",         leanAfter: 0.90 },
      { type: "endorse", valence: "supports",   edgeType: "predict_future",         leanAfter: 0.91 },
    ],
    submitRationale:
      "I found nothing that seriously challenged my view. The developmental evidence is overwhelming — I remain very strongly in favor of meaningful screen limits for children under 12.",
  },
];

// ── Fetch topics from DB ──────────────────────────────────────────────────────

async function getTopicId(title: string): Promise<string | null> {
  const { data } = await supabase
    .from("topics")
    .select("id, title")
    .limit(20);
  const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const needle    = normalise(title);
  const topic = (data ?? []).find((t: { title: string }) =>
    normalise(t.title).includes(needle.slice(0, 15)) ||
    needle.includes(normalise(t.title).slice(0, 15))
  );
  return topic?.id ?? null;
}

// ── Run one simulation ────────────────────────────────────────────────────────

async function runSim(sim: Sim, index: number): Promise<boolean> {
  const delim = "─".repeat(70);
  console.log(`\n${delim}`);
  console.log(`SIM ${index + 1}: ${sim.label}`);
  console.log(delim);

  let allPassed = true;
  const die = (msg: string) => { fail(msg); allPassed = false; };

  // 1. Get topic
  const topicId = await getTopicId(sim.topicTitle);
  check(!!topicId, "Topic found in DB", topicId ?? "none");
  if (!topicId) { die("Cannot proceed without topic"); return false; }

  // 2. Create participant
  const p1 = await api("POST", "/api/participants", { age_range: "25–34", education: "Bachelor's degree" });
  if (!check(p1.ok, "POST /api/participants", `status=${p1.status}`)) return false;
  const { participantId, condition } = p1.data as { participantId: string; condition: string };
  pass(`Condition assigned: ${condition}`);

  // 3. Create session
  const p2 = await api("POST", "/api/sessions", {
    participant_id: participantId,
    question:       sim.topicTitle,
    prior_lean:     sim.priorLean,
    prior_reasons:  sim.priorReasons,
    topic_id:       topicId,
  });
  if (!check(p2.ok, "POST /api/sessions", `status=${p2.status}`)) return false;
  const { sessionId } = p2.data as { sessionId: string };

  // 4. Generate cards (calls LLM)
  console.log("  … calling LLM for cards (may take 5–10s)");
  const p3 = await api("POST", "/api/cards", { session_id: sessionId });
  if (!check(p3.ok, "POST /api/cards", `status=${p3.status}`)) {
    fail("Card generation failed", JSON.stringify(p3.data));
    allPassed = false;
    // Continue with simulated card interactions using synthetic nodes
  }
  const cards = p3.ok ? (p3.data as { cards: Array<{ edge_type: string; valence: string; headline: string; content: string }> }).cards : [];
  check(cards.length === 3, `Cards generated: ${cards.length}/3`);

  // 5. Simulate card interactions
  let elapsed = 8000;
  for (let i = 0; i < sim.actions.length; i++) {
    const action = sim.actions[i];
    elapsed += 10000 + i * 5000;

    // Match to a generated card if possible, else use synthetic values
    const matchCard = cards[i % Math.max(cards.length, 1)];
    const cardContent = matchCard?.content ?? `Synthetic argument ${i + 1} for ${sim.topicTitle}`;
    const edgeType    = matchCard?.edge_type as string ?? action.edgeType;
    const valence     = matchCard?.valence   as string ?? action.valence;

    if (action.type === "endorse") {
      // Add node to graph first
      const nRes = await api("POST", "/api/nodes", {
        session_id:  sessionId,
        edge_type:   edgeType,
        valence:     valence,
        content:     cardContent,
        authored_by: "system",
      });
      if (!check(nRes.ok, `Action ${i+1}: node added (${action.type}/${valence})`, `status=${nRes.status}`)) {
        allPassed = false; continue;
      }
      const nodeId = (nRes.data as { id: string }).id;

      // Log endorse event
      const eRes = await api("POST", "/api/events", {
        session_id:      sessionId,
        node_id:         nodeId,
        event_type:      "endorse",
        payload:         { weight: 1 },
        elapsed_ms:      elapsed,
        hidden_valence:  valence,
        hidden_edge_type: edgeType,
      });
      check(eRes.ok, `  endorse event logged`, `status=${eRes.status}`);
      if (!eRes.ok) allPassed = false;
    } else {
      // Dismiss: no node added, hidden fields only
      const eRes = await api("POST", "/api/events", {
        session_id:       sessionId,
        node_id:          null,
        event_type:       "dismiss",
        payload:          null,
        elapsed_ms:       elapsed,
        hidden_valence:   valence,
        hidden_edge_type: edgeType,
      });
      check(eRes.ok, `Action ${i+1}: dismiss event logged (${valence})`, `status=${eRes.status}`);
      if (!eRes.ok) allPassed = false;
    }

    // Lean shift + lean sample (every action produces one)
    const lean = action.leanAfter;
    const lsRes = await api("POST", "/api/lean-samples", {
      session_id: sessionId,
      node_id:    null,
      lean_value: lean,
    });
    check(lsRes.ok, `  lean sample saved (${lean})`, `status=${lsRes.status}`);
    if (!lsRes.ok) allPassed = false;

    const leRes = await api("POST", "/api/events", {
      session_id: sessionId,
      event_type: "lean_shift",
      payload:    { lean },
      elapsed_ms: elapsed + 500,
    });
    check(leRes.ok, `  lean_shift event logged`, `status=${leRes.status}`);
    if (!leRes.ok) allPassed = false;
  }

  // 6. Check trigger
  console.log("  … checking trigger");
  const trigRes = await api("POST", "/api/trigger", { session_id: sessionId });
  check(trigRes.ok, `POST /api/trigger`, `status=${trigRes.status}`);
  const trigData = trigRes.data as { triggered: boolean; prompt?: string; triggerId?: string };
  pass(`Trigger fired: ${trigData.triggered}  condition=${condition}`);
  if (trigData.triggered && trigData.prompt) {
    pass(`Prompt: "${trigData.prompt.slice(0, 60)}…"`);
  }

  // 7. If triggered, save participant response
  if (trigData.triggered && trigData.triggerId) {
    const respRes = await api("PATCH", `/api/trigger/${trigData.triggerId}`, {
      response: "I had not considered that angle before — it challenges my assumption.",
    });
    check(respRes.ok, "PATCH /api/trigger/:id (response saved)", `status=${respRes.status}`);
    if (!respRes.ok) allPassed = false;
  }

  // 8. Submit rationale
  const ratRes = await api("POST", "/api/rationale", {
    session_id: sessionId,
    text:       sim.submitRationale,
  });
  if (!check(ratRes.ok, "POST /api/rationale", `status=${ratRes.status}`)) {
    fail("Rationale submission failed", JSON.stringify(ratRes.data));
    allPassed = false;
  }

  // 9. Fetch debrief
  const debRes = await api("GET", `/api/debrief?session_id=${sessionId}`, undefined);
  check(debRes.ok, "GET /api/debrief", `status=${debRes.status}`);

  // 10. Verify DB state
  const { data: sessionRow } = await supabase
    .from("sessions")
    .select("status, current_lean, completed_at")
    .eq("id", sessionId)
    .single();

  check(sessionRow?.status === "complete",   `sessions.status = complete`,   sessionRow?.status ?? "null");
  check(sessionRow?.current_lean !== null,   `sessions.current_lean written`, String(sessionRow?.current_lean ?? "null"));
  check(sessionRow?.completed_at !== null,   `sessions.completed_at written`, String(sessionRow?.completed_at ?? "null"));

  const { data: outcomeRow } = await supabase
    .from("session_outcome")
    .select("initial_lean, final_lean, equilibrium_reached, hardened_prematurely")
    .eq("session_id", sessionId)
    .single();

  check(!!outcomeRow,                        `session_outcome row exists`);
  check(outcomeRow?.initial_lean !== null,   `initial_lean written`,     String(outcomeRow?.initial_lean ?? "null"));
  check(outcomeRow?.final_lean   !== null,   `final_lean written`,       String(outcomeRow?.final_lean   ?? "null"));

  const { data: rationaleRow } = await supabase
    .from("final_rationale")
    .select("text")
    .eq("session_id", sessionId)
    .single();

  check(!!rationaleRow?.text, `final_rationale text saved`, `${rationaleRow?.text?.split(" ").length ?? 0} words`);

  const { count: leanCount } = await supabase
    .from("lean_samples")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);

  check((leanCount ?? 0) > 0, `lean_samples collected`, `${leanCount ?? 0} rows`);
  check((leanCount ?? 0) === sim.actions.length, `lean_samples count matches actions`, `${leanCount}/${sim.actions.length}`);

  // Trigger table check
  const { count: trigCount } = await supabase
    .from("triggers")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);

  const expectedTriggers = trigData.triggered ? 1 : 0;
  check(trigCount === expectedTriggers, `triggers table`, `${trigCount} rows, expected ${expectedTriggers}`);

  if (trigData.triggered) {
    const { data: promptEventRow } = await supabase
      .from("prompt_events")
      .select("prompt_text, response_text, condition")
      .eq("session_id", sessionId)
      .maybeSingle();
    check(!!promptEventRow, `prompt_events row exists`);
    check(!!promptEventRow?.prompt_text,    `prompt_text written`);
    check(!!promptEventRow?.response_text,  `response_text written (mediator captured)`);
    check(promptEventRow?.condition === condition, `condition matches`, `${promptEventRow?.condition}`);
  }

  return allPassed;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Verify server is up
  try {
    await fetch(`${BASE}/`);
  } catch {
    console.error(`\n✗ Cannot reach ${BASE} — is the dev server running? (npm run dev)\n`);
    process.exit(1);
  }

  const results: boolean[] = [];
  for (let i = 0; i < SIMS.length; i++) {
    const ok = await runSim(SIMS[i], i);
    results.push(ok);
  }

  console.log("\n" + "═".repeat(70));
  console.log("SUMMARY");
  console.log("═".repeat(70));
  for (let i = 0; i < SIMS.length; i++) {
    const status = results[i] ? "✓ PASS" : "✗ FAIL";
    console.log(`  ${status}  SIM ${i + 1}: ${SIMS[i].label}`);
  }
  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} simulations fully passed\n`);
}

main().catch(console.error);
