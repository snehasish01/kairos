import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { rejectIfDemo } from "@/lib/demo/token";

export async function POST(req: NextRequest) {
  const demoBlocked = rejectIfDemo(req);
  if (demoBlocked) return demoBlocked;

  let body: {
    participant_id?: string;
    question?: string;
    prior_lean?: number;
    prior_reasons?: string;
    topic_id?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { participant_id, question, prior_lean, prior_reasons, topic_id } = body;

  if (!participant_id || !question?.trim()) {
    return NextResponse.json(
      { error: "participant_id and question are required" },
      { status: 400 },
    );
  }
  if (prior_lean !== undefined && (prior_lean < -1 || prior_lean > 1)) {
    return NextResponse.json(
      { error: "prior_lean must be between -1 and 1" },
      { status: 400 },
    );
  }

  // Create session row
  const { data: session, error: sErr } = await supabaseAdmin
    .from("sessions")
    .insert({ participant_id, question: question.trim(), prior_lean, prior_reasons, topic_id: topic_id ?? null })
    .select("id")
    .single();

  if (sErr || !session) {
    console.error("session insert:", sErr);
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }

  // Seed the root node (the question itself; no parent, no edge_type)
  const { data: rootNode, error: nErr } = await supabaseAdmin
    .from("nodes")
    .insert({
      session_id:  session.id,
      parent_id:   null,
      edge_type:   null,
      valence:     "neutral",
      content:     question.trim(),
      authored_by: "system",
      depth:       0,
    })
    .select("id")
    .single();

  if (nErr || !rootNode) {
    console.error("root node insert:", nErr);
    return NextResponse.json({ error: "Failed to seed root node" }, { status: 500 });
  }

  return NextResponse.json(
    { sessionId: session.id, rootNodeId: rootNode.id },
    { status: 201 },
  );
}
