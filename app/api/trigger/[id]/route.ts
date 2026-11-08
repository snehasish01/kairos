import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin }                from "@/lib/supabase";
import { MIN_WORDS_PROMPT, MAX_WORDS_PROMPT, countWords, wordLimitError } from "@/lib/word-limits";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: { response?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { response } = body;
  if (!response || typeof response !== "string") {
    return NextResponse.json({ error: "response (string) required" }, { status: 400 });
  }

  // Same limits for every condition — only prompt timing may differ between arms.
  const limitErr = wordLimitError(response.trim(), MIN_WORDS_PROMPT, MAX_WORDS_PROMPT);
  if (limitErr) {
    return NextResponse.json({ error: limitErr }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("triggers")
    .update({ participant_response: response.trim() })
    .eq("id", id)
    .select("id, session_id, participant_response")
    .single();

  if (error || !data) {
    console.error("trigger response update:", error);
    return NextResponse.json({ error: "Failed to save response" }, { status: 500 });
  }

  const sessionId = (data as { session_id: string }).session_id;

  // Mirror the response to prompt_events — the canonical mediator capture table.
  // Non-fatal: triggers row is already updated above.
  const { error: peErr } = await supabaseAdmin
    .from("prompt_events")
    .update({ response_text: response.trim(), word_count: countWords(response.trim()) })
    .eq("session_id", sessionId);

  if (peErr) {
    console.error("[trigger/response] prompt_events update:", peErr);
  }

  return NextResponse.json(data);
}
