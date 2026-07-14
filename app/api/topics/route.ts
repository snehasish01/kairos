import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("topics")
    .select("id, title, description")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("topics fetch:", error);
    return NextResponse.json({ error: "Failed to load topics" }, { status: 500 });
  }

  return NextResponse.json({ topics: data ?? [] });
}
