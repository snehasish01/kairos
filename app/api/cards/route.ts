import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { buildGraph, DbNode } from "@/lib/conviction-graph";
import { generateCards } from "@/lib/card-generator";

export async function POST(req: NextRequest) {
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

  const { data: session, error: sessionErr } = await supabaseAdmin
    .from("sessions")
    .select("id, prior_lean")
    .eq("id", session_id)
    .single();

  if (sessionErr || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const { data: nodes, error: nodesErr } = await supabaseAdmin
    .from("nodes")
    .select("*")
    .eq("session_id", session_id)
    .order("created_at", { ascending: true });

  if (nodesErr || !nodes || nodes.length === 0) {
    return NextResponse.json({ error: "No nodes found for session" }, { status: 404 });
  }

  const root = buildGraph(nodes as DbNode[]);
  if (!root) {
    return NextResponse.json({ error: "Could not build graph" }, { status: 422 });
  }

  try {
    const cards = await generateCards(root, session.prior_lean);
    return NextResponse.json({ cards });
  } catch (err) {
    console.error("card generation error:", err);
    return NextResponse.json({ error: "Card generation failed" }, { status: 500 });
  }
}
