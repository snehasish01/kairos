import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { guardResearch } from "@/lib/study-gate";
import { buildGraph } from "@/lib/conviction-graph";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const blocked = guardResearch(req);
  if (blocked) return blocked;

  const { id } = await params;

  const [{ data: session, error: sErr }, { data: nodes, error: nErr }] =
    await Promise.all([
      supabaseAdmin
        .from("sessions")
        .select("id, participant_id, question, prior_lean, prior_reasons, current_lean, status, started_at, completed_at")
        .eq("id", id)
        .single(),
      supabaseAdmin
        .from("nodes")
        .select("id, session_id, parent_id, edge_type, valence, content, authored_by, depth, created_at")
        .eq("session_id", id)
        .order("created_at", { ascending: true }),
    ]);

  if (sErr || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (nErr) {
    console.error("nodes fetch:", nErr);
    return NextResponse.json({ error: "Failed to fetch nodes" }, { status: 500 });
  }

  const graph = buildGraph(nodes ?? []);
  return NextResponse.json({ session, graph });
}
