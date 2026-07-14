import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin }             from "@/lib/supabase";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  // mailing_list has no session_id column and no FK — isolation is by design.
  const { error } = await supabaseAdmin
    .from("mailing_list")
    .insert({ email });

  if (error) {
    console.error("[mailing-list] insert:", error);
    return NextResponse.json({ error: "Failed to save email" }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
