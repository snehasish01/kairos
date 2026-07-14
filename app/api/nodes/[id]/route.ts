import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: { valence?: string; content?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: Record<string, string> = {};
  if (body.content !== undefined) updates.content = body.content.trim();
  if (body.valence !== undefined) {
    if (!["supports", "undermines", "neutral"].includes(body.valence)) {
      return NextResponse.json({ error: "Invalid valence" }, { status: 400 });
    }
    updates.valence = body.valence;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("nodes")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Node not found or update failed" }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const { error } = await supabaseAdmin.from("nodes").delete().eq("id", id);

  if (error) {
    console.error("node delete:", error);
    return NextResponse.json({ error: "Failed to delete node" }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
