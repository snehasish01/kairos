import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin }             from "@/lib/supabase";
import { rejectIfDemo } from "@/lib/demo/token";
import { computeDebrief }            from "@/lib/debrief-summary";

export async function GET(req: NextRequest) {
  const demoBlocked = rejectIfDemo(req);
  if (demoBlocked) return demoBlocked;

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

  return NextResponse.json(
    computeDebrief({ session, rawEvents, rawNodes, rawSamples, promptEventData, outcomeData }),
  );
}
