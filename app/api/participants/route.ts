import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { rejectIfDemo } from "@/lib/demo/token";
import { ALREADY_PARTICIPATED_MSG } from "@/lib/prolific";

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
  const demoBlocked = rejectIfDemo(req);
  if (demoBlocked) return demoBlocked;

  let body: {
    age_range?:           string;
    education?:           string;
    prolific_pid?:        string;
    prolific_study_id?:   string;
    prolific_session_id?: string;
  };
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

  // Participants must arrive from Prolific. Test IDs ("test…") are accepted like any other.
  const prolificPid = typeof body.prolific_pid === "string" ? body.prolific_pid.trim() : "";
  if (!prolificPid) {
    return NextResponse.json({ error: "prolific_pid required" }, { status: 400 });
  }
  const prolificStudyId   = typeof body.prolific_study_id   === "string" ? body.prolific_study_id.trim()   || null : null;
  const prolificSessionId = typeof body.prolific_session_id === "string" ? body.prolific_session_id.trim() || null : null;

  let condition: Condition;
  try {
    condition = await assignCondition();
  } catch (err) {
    console.error("condition assignment failed:", err);
    return NextResponse.json({ error: "Failed to assign condition" }, { status: 500 });
  }

  const { data, error } = await supabaseAdmin
    .from("participants")
    .insert({
      age_range,
      education,
      condition,
      prolific_pid:        prolificPid,
      prolific_study_id:   prolificStudyId,
      prolific_session_id: prolificSessionId,
    })
    .select("id")
    .single();

  // Log only the error code: Postgres error messages/details can echo row values,
  // including the Prolific ID.
  if (error?.code === "23505") {
    // Partial unique index on prolific_pid (non-test IDs): this account already took part.
    console.error("participant insert rejected: duplicate prolific_pid (code 23505)");
    return NextResponse.json(
      { error: ALREADY_PARTICIPATED_MSG, code: "already_participated" },
      { status: 409 },
    );
  }
  if (error || !data) {
    console.error("participant insert failed, code:", error?.code ?? "no data");
    return NextResponse.json({ error: "Failed to create participant" }, { status: 500 });
  }

  return NextResponse.json({ participantId: data.id, condition });
}
