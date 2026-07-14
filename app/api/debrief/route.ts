import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin }             from "@/lib/supabase";
import type { EventRow }             from "@/lib/signal-processor";
import { EDGE_TYPES }                from "@/lib/ui-constants";

export async function GET(req: NextRequest) {
  const session_id = req.nextUrl.searchParams.get("session_id");
  if (!session_id) {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }

  const { data: session, error: sessionErr } = await supabaseAdmin
    .from("sessions")
    .select("id, participant_id, prior_lean, started_at")
    .eq("id", session_id)
    .single();

  if (sessionErr || !session) {
    console.error("[debrief] session query:", sessionErr);
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const [
    { data: rawEvents },
    { data: rawNodes },
    { data: rawSamples },
    { data: promptEventData },
    { data: outcomeData },
  ] = await Promise.all([
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
      .from("lean_samples")
      .select("lean_value, created_at")
      .eq("session_id", session_id)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("prompt_events")
      .select("fired_at, prompt_text, response_text")
      .eq("session_id", session_id)
      .maybeSingle(),
    supabaseAdmin
      .from("session_outcome")
      .select("final_lean")
      .eq("session_id", session_id)
      .maybeSingle(),
  ]);

  const events  = (rawEvents  ?? []) as EventRow[];
  const nodes   = (rawNodes   ?? []) as { id: string; edge_type: string | null; valence: string }[];
  const samples = (rawSamples ?? []) as { lean_value: number; created_at: string }[];
  const promptEv = promptEventData as {
    fired_at: string; prompt_text: string | null; response_text: string | null;
  } | null;
  const outcome = outcomeData as { final_lean: number | null } | null;

  // ── Confirmation skew ────────────────────────────────────────────────────
  const valenceById = new Map(nodes.map(n => [n.id, n.valence]));
  let supportingEngaged = 0;
  let underminingEngaged = 0;
  let neutralEngaged = 0;

  for (const e of events) {
    if ((e.event_type === "endorse" || e.event_type === "endorse_weighted") && e.node_id) {
      const v = valenceById.get(e.node_id) ?? "neutral";
      if (v === "supports")   supportingEngaged++;
      if (v === "undermines") underminingEngaged++;
      if (v === "neutral")    neutralEngaged++;
    }
    if (e.event_type === "dismiss" && e.hidden_valence) {
      if (e.hidden_valence === "supports")   supportingEngaged++;
      if (e.hidden_valence === "undermines") underminingEngaged++;
      if (e.hidden_valence === "neutral")    neutralEngaged++;
    }
  }

  // ── Operation distribution ───────────────────────────────────────────────
  const operationDist: Record<string, number> = {};
  for (const t of EDGE_TYPES) operationDist[t] = 0;
  for (const n of nodes) {
    if (n.edge_type && n.edge_type in operationDist) {
      operationDist[n.edge_type]++;
    }
  }
  const rung2and4Covered =
    operationDist.observe_self > 0 && operationDist.reflect_on_prediction > 0;

  // ── Lean trajectory ──────────────────────────────────────────────────────
  const sessionStart = new Date(session.started_at).getTime();
  const initialLean  = session.prior_lean ?? 0;

  const leanTrajectory: { lean: number; elapsed_s: number }[] = [
    { lean: initialLean, elapsed_s: 0 },
    ...samples.map(s => ({
      lean:      s.lean_value,
      elapsed_s: Math.round((new Date(s.created_at).getTime() - sessionStart) / 1000),
    })),
  ];

  // Final lean: last lean_sample, else session_outcome, else prior_lean.
  const finalLean =
    samples.length > 0
      ? samples[samples.length - 1].lean_value
      : (outcome?.final_lean ?? initialLean);

  // ── Prompt moment ────────────────────────────────────────────────────────
  let promptFired       = false;
  let promptText: string | null = null;
  let promptResponse: string | null = null;
  let promptElapsed_s: number | null = null;

  if (promptEv) {
    promptFired     = true;
    promptText      = promptEv.prompt_text;
    promptResponse  = promptEv.response_text?.trim() || null;
    promptElapsed_s = Math.round(
      (new Date(promptEv.fired_at).getTime() - sessionStart) / 1000,
    );
  }

  return NextResponse.json({
    initialLean,
    finalLean,
    confirmationSkew:  { supportingEngaged, underminingEngaged, neutralEngaged },
    operationDist,
    rung2and4Covered,
    leanTrajectory,
    promptFired,
    promptText,
    promptResponse,
    promptElapsed_s,
  });
}
