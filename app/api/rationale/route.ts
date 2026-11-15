import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin }                from "@/lib/supabase";
import { rejectIfDemo } from "@/lib/demo/token";
import { computeSignals, type EventRow } from "@/lib/signal-processor";
import type { DbNode }                   from "@/lib/conviction-graph";
import { MIN_WORDS_FINAL, MAX_WORDS_FINAL, countWords, wordLimitError } from "@/lib/word-limits";

type NodeRow = Pick<DbNode, "id" | "edge_type" | "valence">;

export async function POST(req: NextRequest) {
  const demoBlocked = rejectIfDemo(req);
  if (demoBlocked) return demoBlocked;

  let body: { session_id?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { session_id, text } = body;
  if (!session_id || !text?.trim()) {
    return NextResponse.json({ error: "session_id and text required" }, { status: 400 });
  }

  const limitErr = wordLimitError(text.trim(), MIN_WORDS_FINAL, MAX_WORDS_FINAL);
  if (limitErr) {
    return NextResponse.json({ error: limitErr }, { status: 400 });
  }
  const wordCount = countWords(text.trim());

  const { data: session } = await supabaseAdmin
    .from("sessions")
    .select("id, prior_lean, status")
    .eq("id", session_id)
    .single();

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const [{ data: rawEvents }, { data: rawNodes }, { data: promptEvent }] = await Promise.all([
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
      .from("prompt_events")
      .select("response_text")
      .eq("session_id", session_id)
      .maybeSingle(),
  ]);

  const events = (rawEvents ?? []) as EventRow[];
  const nodes  = (rawNodes  ?? []) as NodeRow[];

  // triggerAnswered: participant submitted a non-empty response to the dissonance prompt.
  // Satisfies the "earned exit" clause in equilibriumReached.
  const pe = promptEvent as { response_text?: string | null } | null;
  const triggerAnswered = typeof pe?.response_text === "string"
    && pe.response_text.trim().length > 0;

  // Final lean: last lean_shift payload, falling back to prior_lean.
  const lastShift = [...events].reverse().find(e => e.event_type === "lean_shift");
  const rawLean   = lastShift?.payload?.lean;
  const finalLean = typeof rawLean === "number" ? rawLean : (session.prior_lean ?? 0);

  const signals = computeSignals(events, nodes, triggerAnswered, session.prior_lean ?? 0);

  // hardened_prematurely: dismissed an undermining card AND lean is above the exit
  // commitment threshold — lean locked before genuine counter-evidence engagement.
  // Recorded outcome for analysis; never used as a gate.
  const dismissedUndermining = events.some(
    e => e.event_type === "dismiss" && e.hidden_valence === "undermines",
  );
  const hardenedPrematurely = dismissedUndermining && signals.commitmentScore > 0.65;

  // Write final_rationale. Unique index on session_id means upsert is idempotent
  // if the participant refreshes the rationale page and resubmits.
  const { error: rationaleErr } = await supabaseAdmin
    .from("final_rationale")
    .upsert({ session_id, text: text.trim(), word_count: wordCount }, { onConflict: "session_id" });

  if (rationaleErr) {
    console.error("[rationale] insert:", rationaleErr);
    return NextResponse.json({ error: "Failed to save rationale" }, { status: 500 });
  }

  // Write session_outcome. All three flags are recorded outcomes for analysis —
  // none of them gate the session.
  await supabaseAdmin
    .from("session_outcome")
    .upsert(
      {
        session_id,
        equilibrium_reached:  signals.equilibriumReached,
        hardened_prematurely: hardenedPrematurely,
        bailed:               false,
        initial_lean:         session.prior_lean ?? null,
        final_lean:           finalLean,
      },
      { onConflict: "session_id" },
    );

  await supabaseAdmin
    .from("sessions")
    .update({ status: "complete", completed_at: new Date().toISOString(), current_lean: finalLean })
    .eq("id", session_id);

  console.log("[rationale]", {
    session_id,
    word_count:           wordCount,
    trigger_answered:     triggerAnswered,
    equilibrium_reached:  signals.equilibriumReached,
    hardened_prematurely: hardenedPrematurely,
    final_lean:           finalLean,
    initial_lean:         session.prior_lean,
  });

  return NextResponse.json({ ok: true });
}
