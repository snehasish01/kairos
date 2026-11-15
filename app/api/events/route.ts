import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { rejectIfDemo } from "@/lib/demo/token";

const VALID_EVENT_TYPES = new Set([
  "open", "expand", "dwell_start", "dwell_end",
  "endorse", "endorse_weighted", "dismiss", "add_own", "revisit",
  "lean_shift", "commit_intent",
]);

export async function POST(req: NextRequest) {
  const demoBlocked = rejectIfDemo(req);
  if (demoBlocked) return demoBlocked;

  let body: {
    session_id:        string;
    node_id?:          string | null;
    event_type:        string;
    payload?:          Record<string, unknown> | null;
    elapsed_ms?:       number | null;
    hidden_valence?:   string | null;
    hidden_edge_type?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    session_id,
    node_id          = null,
    event_type,
    payload          = null,
    elapsed_ms       = null,
    hidden_valence   = null,
    hidden_edge_type = null,
  } = body;

  if (!session_id) {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }
  if (!VALID_EVENT_TYPES.has(event_type)) {
    return NextResponse.json({ error: `Invalid event_type: ${event_type}` }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("events")
    .insert({ session_id, node_id, event_type, payload, elapsed_ms, hidden_valence, hidden_edge_type })
    .select()
    .single();

  if (error || !data) {
    console.error("event insert:", error);
    return NextResponse.json({ error: "Failed to log event" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
