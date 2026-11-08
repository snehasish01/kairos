import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { isTestPid } from "@/lib/prolific";

// Early repeat-participation check for /onboard. The insert-time unique index on
// prolific_pid remains the backstop. POST (not GET) keeps the ID out of URLs and access logs.
export async function POST(req: NextRequest) {
  let body: { prolific_pid?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const pid = typeof body.prolific_pid === "string" ? body.prolific_pid.trim() : "";
  if (!pid) {
    return NextResponse.json({ error: "prolific_pid required" }, { status: 400 });
  }
  if (isTestPid(pid)) {
    return NextResponse.json({ alreadyParticipated: false });
  }

  const { count, error } = await supabaseAdmin
    .from("participants")
    .select("id", { count: "exact", head: true })
    .eq("prolific_pid", pid);

  if (error) {
    console.error("participant check failed, code:", error.code);
    return NextResponse.json({ error: "Check failed" }, { status: 500 });
  }

  return NextResponse.json({ alreadyParticipated: (count ?? 0) > 0 });
}
