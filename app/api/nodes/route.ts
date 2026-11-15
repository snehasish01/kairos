import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { rejectIfDemo } from "@/lib/demo/token";
import type { EdgeType, Valence, AuthoredBy } from "@/lib/conviction-graph";

export async function GET(req: NextRequest) {
  const demoBlocked = rejectIfDemo(req);
  if (demoBlocked) return demoBlocked;

  const sid = req.nextUrl.searchParams.get("session_id");
  if (!sid) {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin
    .from("nodes")
    .select("*")
    .eq("session_id", sid)
    .order("created_at", { ascending: true });
  if (error) {
    return NextResponse.json({ error: "Failed to fetch nodes" }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}

const VALID_EDGE_TYPES = new Set<string>([
  "observe_world", "observe_self", "predict_future", "reflect_on_prediction",
]);
const VALID_VALENCES    = new Set<string>(["supports", "undermines", "neutral"]);
const VALID_AUTHORED_BY = new Set<string>(["system", "user"]);

export async function POST(req: NextRequest) {
  const demoBlocked = rejectIfDemo(req);
  if (demoBlocked) return demoBlocked;

  let body: {
    session_id?:  string;
    parent_id?:   string | null;
    edge_type?:   string;
    valence?:     string;
    content?:     string;
    authored_by?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    session_id,
    parent_id   = null,
    edge_type,
    valence     = "neutral",
    content,
    authored_by = "system",
  } = body;

  if (!session_id || !content?.trim()) {
    return NextResponse.json(
      { error: "session_id and content are required" },
      { status: 400 },
    );
  }
  if (edge_type && !VALID_EDGE_TYPES.has(edge_type)) {
    return NextResponse.json({ error: "Invalid edge_type" }, { status: 400 });
  }
  if (!VALID_VALENCES.has(valence)) {
    return NextResponse.json({ error: "Invalid valence" }, { status: 400 });
  }
  if (!VALID_AUTHORED_BY.has(authored_by)) {
    return NextResponse.json({ error: "Invalid authored_by" }, { status: 400 });
  }

  // Derive depth from parent (or 0 if no parent)
  let depth = 0;
  if (parent_id) {
    const { data: parent, error: pErr } = await supabaseAdmin
      .from("nodes")
      .select("depth")
      .eq("id", parent_id)
      .single();
    if (pErr || !parent) {
      return NextResponse.json({ error: "Parent node not found" }, { status: 404 });
    }
    depth = parent.depth + 1;
  }

  const { data, error } = await supabaseAdmin
    .from("nodes")
    .insert({
      session_id,
      parent_id,
      edge_type: (edge_type as EdgeType) ?? null,
      valence:     valence as Valence,
      content:     content.trim(),
      authored_by: authored_by as AuthoredBy,
      depth,
    })
    .select()
    .single();

  if (error || !data) {
    console.error("node insert:", error);
    return NextResponse.json({ error: "Failed to create node" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
