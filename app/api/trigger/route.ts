import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin }                from "@/lib/supabase";
import { computeSignals, type EventRow } from "@/lib/signal-processor";
import { shouldTrigger, type Condition } from "@/lib/trigger-engine";
import { buildGraph, type DbNode }       from "@/lib/conviction-graph";
import { generateDissonancePrompt }      from "@/lib/dissonance-prompt";
import { hasDemoCookie, readDemo }      from "@/lib/demo/token";
import { demoTrigger }                  from "@/lib/demo/server";

function demoExpired() {
  return NextResponse.json({ error: "Demo session expired. Start the demo again.", code: "demo_expired" }, { status: 401 });
}

// NodeRow subset satisfies signal-processor's interface (structural typing).
type NodeRow = Pick<DbNode, "id" | "edge_type" | "valence">;

export async function POST(req: NextRequest) {
  // Demo mode: state comes from the request body; this branch never touches Supabase.
  if (hasDemoCookie(req)) {
    const claims = readDemo(req);
    if (!claims) return demoExpired();
    return demoTrigger(req, claims);
  }

  let body: { session_id?: string; demo?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // A demo payload without a valid demo cookie (e.g. expired) must not reach the DB path.
  if (body && typeof body === "object" && "demo" in body) return demoExpired();

  const { session_id } = body;
  if (!session_id) {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }

  // ── Guard: session state ──────────────────────────────────────────────────
  const { data: session, error: sessionErr } = await supabaseAdmin
    .from("sessions")
    .select("id, participant_id, status, question, prior_lean, prior_reasons")
    .eq("id", session_id)
    .single();

  if (sessionErr || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  // Only block completely finished sessions — triggered sessions may still need
  // to restore their DissonanceCard prompt on page refresh.
  if (session.status === "complete") {
    return NextResponse.json({ triggered: false });
  }

  // ── Guard: one trigger per session — return existing data if already fired ─
  // This lets ConvictionCanvas restore the DissonanceCard after a page refresh
  // or when testing with a session that was triggered in a prior code revision.
  const { data: existingRows } = await supabaseAdmin
    .from("triggers")
    .select("id, prompt_generated")
    .eq("session_id", session_id)
    .limit(1);

  const existingTrigger = existingRows?.[0] ?? null;
  if (existingTrigger) {
    return NextResponse.json({
      triggered:    true,
      triggerId:    existingTrigger.id,
      prompt:       existingTrigger.prompt_generated
                      ?? "What have you found yourself avoiding as you explore this conviction?",
      alreadyFired: true,
    });
  }

  // ── Fetch condition ───────────────────────────────────────────────────────
  const { data: participant, error: participantErr } = await supabaseAdmin
    .from("participants")
    .select("condition")
    .eq("id", session.participant_id)
    .single();

  if (participantErr || !participant) {
    return NextResponse.json({ error: "Participant not found" }, { status: 404 });
  }

  // ── Fetch events + full nodes ─────────────────────────────────────────────
  // Full node rows (with content) needed by generateDissonancePrompt.
  const [{ data: rawEvents }, { data: rawNodes }] = await Promise.all([
    supabaseAdmin
      .from("events")
      .select("event_type, node_id, payload, elapsed_ms, hidden_valence, hidden_edge_type")
      .eq("session_id", session_id)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("nodes")
      .select("*")
      .eq("session_id", session_id)
      .order("created_at", { ascending: true }),
  ]);

  const events    = (rawEvents ?? []) as EventRow[];
  const fullNodes = (rawNodes  ?? []) as DbNode[];
  const nodeRows  = fullNodes as NodeRow[];  // structural subset, safe to pass

  // ── Decide ────────────────────────────────────────────────────────────────
  const signals = computeSignals(events, nodeRows, false, session.prior_lean ?? 0);

  if (!shouldTrigger(participant.condition as Condition, signals, events, false)) {
    return NextResponse.json({ triggered: false, signals });
  }

  // ── Generate dissonance question ─────────────────────────────────────────
  const root = buildGraph(fullNodes);
  const prompt = root
    ? await generateDissonancePrompt(
        {
          question:      session.question,
          prior_lean:    session.prior_lean   ?? null,
          prior_reasons: session.prior_reasons ?? null,
        },
        root,
        signals,
        events,
        fullNodes,
      ).catch(() => "What have you found yourself avoiding as you explore this conviction?")
    : "What have you found yourself avoiding as you explore this conviction?";

  // ── Fire: write trigger row + update session ──────────────────────────────
  const { data: triggerRow, error: triggerErr } = await supabaseAdmin
    .from("triggers")
    .insert({
      session_id,
      condition:        participant.condition,
      signal_scores:    signals,
      prompt_generated: prompt,
      elapsed_ms:       events.at(-1)?.elapsed_ms ?? null,
    })
    .select()
    .single();

  if (triggerErr || !triggerRow) {
    console.error("trigger insert:", triggerErr);
    return NextResponse.json({ error: "Failed to log trigger" }, { status: 500 });
  }

  // Write to prompt_events — canonical mediator capture.
  // trigger_type mirrors condition; silent never reaches here.
  const { error: peErr } = await supabaseAdmin
    .from("prompt_events")
    .insert({
      session_id,
      condition:    participant.condition,
      trigger_type: participant.condition,
      prompt_text:  prompt,
      fired_at:     new Date().toISOString(),
    });

  if (peErr) {
    // Non-fatal: log but don't block the session. The triggers row already captured the prompt.
    console.error("[trigger] prompt_events insert:", peErr);
  }

  await supabaseAdmin
    .from("sessions")
    .update({ status: "triggered", trigger_fired_at: new Date().toISOString() })
    .eq("id", session_id);

  return NextResponse.json({
    triggered:  true,
    triggerId:  triggerRow.id,
    prompt,
    signals,
  });
}
