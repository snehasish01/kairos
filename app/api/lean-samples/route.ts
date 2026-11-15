import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin }                from "@/lib/supabase";
import { guardResearch } from "@/lib/study-gate";

export async function POST(req: NextRequest) {
  const blocked = guardResearch(req);
  if (blocked) return blocked;

  let body: { session_id?: string; node_id?: string | null; lean_value?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { session_id, node_id = null, lean_value } = body;

  if (!session_id) {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }
  if (typeof lean_value !== "number" || lean_value < -1 || lean_value > 1) {
    return NextResponse.json({ error: "lean_value must be a number in [-1, 1]" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("lean_samples")
    .insert({ session_id, node_id, lean_value })
    .select()
    .single();

  if (error || !data) {
    console.error("[lean-samples] insert:", error);
    return NextResponse.json({ error: "Failed to save lean sample" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
