/**
 * Checks whether sessions.current_lean is being written after completion,
 * and whether lean delta is computable from session_outcome and lean_samples.
 *
 * Run: npx ts-node --project tsconfig.node.json scripts/check-lean-writeback.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path   from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  console.log("\n── Session / lean writeback audit ─────────────────────────────────────\n");

  // ── 1. Sessions: status + lean fields ────────────────────────────────────
  const { data: sessions, error: sErr } = await supabase
    .from("sessions")
    .select("id, status, prior_lean, current_lean, completed_at")
    .order("started_at", { ascending: false })
    .limit(20);

  if (sErr) { console.error("sessions query failed:", sErr.message); process.exit(1); }

  console.log("Sessions (most recent 20):");
  console.log(
    "status".padEnd(12),
    "prior_lean".padEnd(12),
    "current_lean".padEnd(14),
    "current_lean written?".padEnd(22),
    "session_id",
  );
  console.log("─".repeat(90));

  for (const s of sessions ?? []) {
    const written = s.current_lean !== null && s.current_lean !== undefined;
    console.log(
      (s.status ?? "null").padEnd(12),
      String(s.prior_lean ?? "null").padEnd(12),
      String(s.current_lean ?? "null").padEnd(14),
      (written ? "✓ yes" : "✗ NO").padEnd(22),
      s.id,
    );
  }

  const complete     = (sessions ?? []).filter(s => s.status === "complete");
  const withLean     = complete.filter(s => s.current_lean !== null && s.current_lean !== undefined);
  console.log(`\nComplete sessions: ${complete.length}  |  current_lean populated: ${withLean.length}`);
  if (complete.length > 0 && withLean.length === 0) {
    console.log("⚠  current_lean is NOT being written on completion.\n");
  }

  // ── 2. session_outcome: check final_lean + initial_lean ──────────────────
  const { data: outcomes, error: oErr } = await supabase
    .from("session_outcome")
    .select("session_id, initial_lean, final_lean, equilibrium_reached, hardened_prematurely")
    .order("created_at", { ascending: false })
    .limit(20);

  if (oErr) { console.error("session_outcome query failed:", oErr.message); process.exit(1); }

  console.log("\nsession_outcome rows (most recent 20):");
  console.log(
    "initial_lean".padEnd(14),
    "final_lean".padEnd(12),
    "delta".padEnd(8),
    "delta_computable?".padEnd(20),
    "session_id",
  );
  console.log("─".repeat(80));

  for (const o of outcomes ?? []) {
    const computable = o.initial_lean !== null && o.final_lean !== null;
    const delta      = computable ? (o.final_lean! - o.initial_lean!).toFixed(3) : "n/a";
    console.log(
      String(o.initial_lean ?? "null").padEnd(14),
      String(o.final_lean   ?? "null").padEnd(12),
      delta.padEnd(8),
      (computable ? "✓ yes" : "✗ missing").padEnd(20),
      o.session_id,
    );
  }

  // ── 3. lean_samples: count per session ───────────────────────────────────
  const { data: leanRows, error: lErr } = await supabase
    .from("lean_samples")
    .select("session_id, lean_value, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (lErr) { console.error("lean_samples query failed:", lErr.message); process.exit(1); }

  const samplesBySid = new Map<string, number>();
  for (const r of leanRows ?? []) {
    samplesBySid.set(r.session_id, (samplesBySid.get(r.session_id) ?? 0) + 1);
  }

  console.log("\nlean_samples per session (from most recent 100 rows):");
  console.log("samples".padEnd(10), "session_id");
  console.log("─".repeat(50));
  for (const [sid, n] of samplesBySid) {
    console.log(String(n).padEnd(10), sid);
  }
  if (samplesBySid.size === 0) console.log("(none — lean_samples table is empty)");

  // ── 4. Events: endorse/dismiss counts per session ────────────────────────
  const { data: eventRows, error: eErr } = await supabase
    .from("events")
    .select("session_id, event_type")
    .in("event_type", ["endorse", "endorse_weighted", "dismiss", "lean_shift"])
    .order("created_at", { ascending: false })
    .limit(500);

  if (eErr) { console.error("events query failed:", eErr.message); process.exit(1); }

  const eventCounts = new Map<string, Record<string, number>>();
  for (const e of eventRows ?? []) {
    if (!eventCounts.has(e.session_id)) {
      eventCounts.set(e.session_id, { endorse: 0, endorse_weighted: 0, dismiss: 0, lean_shift: 0 });
    }
    eventCounts.get(e.session_id)![e.event_type] = (eventCounts.get(e.session_id)![e.event_type] ?? 0) + 1;
  }

  console.log("\nCard interaction events per session:");
  console.log(
    "endorse".padEnd(9), "weighted".padEnd(10), "dismiss".padEnd(9), "lean_shifts".padEnd(13), "session_id",
  );
  console.log("─".repeat(70));
  for (const [sid, c] of eventCounts) {
    console.log(
      String(c.endorse).padEnd(9),
      String(c.endorse_weighted).padEnd(10),
      String(c.dismiss).padEnd(9),
      String(c.lean_shift).padEnd(13),
      sid,
    );
  }
  if (eventCounts.size === 0) console.log("(no endorse/dismiss events recorded yet)");

  // ── 5. Verdict ───────────────────────────────────────────────────────────
  console.log("\n── Verdict ─────────────────────────────────────────────────────────────\n");

  const completeSessions = (sessions ?? []).filter(s => s.status === "complete");
  const currentLeanGap   = completeSessions.filter(
    s => s.current_lean === null || s.current_lean === undefined,
  ).length;

  const outcomesMissingDelta = (outcomes ?? []).filter(
    o => o.initial_lean === null || o.final_lean === null,
  ).length;

  console.log(`sessions.current_lean NOT written on ${currentLeanGap}/${completeSessions.length} complete sessions`);
  console.log(`session_outcome lean delta missing on ${outcomesMissingDelta}/${(outcomes ?? []).length} outcome rows`);
  console.log(`lean_samples collected: ${(leanRows ?? []).length} total rows across ${samplesBySid.size} sessions`);
}

main().catch(console.error);
