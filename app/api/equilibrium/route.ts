import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin }                from "@/lib/supabase";
import { guardResearch } from "@/lib/study-gate";
import { computeSignals, type EventRow } from "@/lib/signal-processor";
import type { DbNode }                   from "@/lib/conviction-graph";

type NodeRow = Pick<DbNode, "id" | "edge_type" | "valence">;

export async function POST(req: NextRequest) {
  const blocked = guardResearch(req);
  if (blocked) return blocked;

  let body: { session_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { session_id } = body;
  if (!session_id) {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }

  // ── Fetch events, nodes, trigger state, and session in parallel ─────────
  const [{ data: rawEvents }, { data: rawNodes }, { data: triggerRows }, { data: sessionRow }] =
    await Promise.all([
      supabaseAdmin
        .from("events")
        .select("event_type, node_id, payload, elapsed_ms, hidden_valence, hidden_edge_type")
        .eq("session_id", session_id)
        .order("created_at", { ascending: true }),
      supabaseAdmin
        .from("nodes")
        .select("id, edge_type, valence")
        .eq("session_id", session_id),
      supabaseAdmin
        .from("triggers")
        .select("participant_response")
        .eq("session_id", session_id)
        .limit(1),
      supabaseAdmin
        .from("sessions")
        .select("prior_lean")
        .eq("id", session_id)
        .single(),
    ]);

  const events  = (rawEvents ?? []) as EventRow[];
  const nodes   = (rawNodes  ?? []) as NodeRow[];

  // triggerAnswered = trigger row exists AND participant submitted a response.
  const triggerAnswered =
    !!triggerRows?.[0]?.participant_response;

  const priorLean = (sessionRow?.prior_lean as number) ?? 0;
  const signals = computeSignals(events, nodes, triggerAnswered, priorLean);

  console.log("[equilibrium]", {
    session_id,
    priorLean_passed:   priorLean,
    session_prior_lean: sessionRow?.prior_lean ?? null,
    triggerAnswered,
    equilibriumReached: signals.equilibriumReached,
    commitmentScore:    signals.commitmentScore,
    leanVelocity:       signals.leanVelocity,
    rung2and4Covered:   signals.rung2and4Covered,
    disconfirmRatio:    signals.disconfirmRatio,
    biasScore:          signals.biasScore,
    eventCount:         events.length,
    nodeCount:          nodes.length,
  });

  return NextResponse.json({
    equilibriumReached: signals.equilibriumReached,
    signals,
  });
}
