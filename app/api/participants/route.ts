import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// random and silent dropped for pilot — restore for full study
const CONDITIONS = ["anticipatory", "reactive"] as const;
type Condition = (typeof CONDITIONS)[number];

async function assignCondition(): Promise<Condition> {
  // Strict alternating: participant 1→anticipatory, 2→reactive, 3→anticipatory…
  // Count all existing participants so the sequence is deterministic.
  const { count, error } = await supabaseAdmin
    .from("participants")
    .select("id", { count: "exact", head: true });

  if (error) throw new Error(error.message);
  return CONDITIONS[(count ?? 0) % 2];
}

export async function POST(req: NextRequest) {
  let body: { age_range?: string; education?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { age_range, education } = body;
  if (!age_range || !education) {
    return NextResponse.json(
      { error: "age_range and education are required" },
      { status: 400 },
    );
  }

  let condition: Condition;
  try {
    condition = await assignCondition();
  } catch (err) {
    console.error("condition assignment failed:", err);
    return NextResponse.json({ error: "Failed to assign condition" }, { status: 500 });
  }

  const { data, error } = await supabaseAdmin
    .from("participants")
    .insert({ age_range, education, condition })
    .select("id")
    .single();

  if (error || !data) {
    console.error("participant insert failed:", error);
    return NextResponse.json({ error: "Failed to create participant" }, { status: 500 });
  }

  return NextResponse.json({ participantId: data.id, condition });
}
