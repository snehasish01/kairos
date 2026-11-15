import { NextRequest, NextResponse } from "next/server";
import { clientIp, liveLlmEnabled, takeStartBudget } from "@/lib/demo/limits";
import { clearDemoCookie, demoConfigured, newDemoClaims, setDemoCookie } from "@/lib/demo/token";

// POST: start a demo session. Issues a signed httpOnly cookie; nothing is written anywhere.
// The demo condition is chosen in the browser; this route never touches the research
// condition counter.
export async function POST(req: NextRequest) {
  if (!demoConfigured()) {
    return NextResponse.json({ error: "The demo is not available right now." }, { status: 503 });
  }
  if (!takeStartBudget(clientIp(req))) {
    return NextResponse.json({ error: "Too many demo sessions from this network. Try again later." }, { status: 429 });
  }
  const res = NextResponse.json({ ok: true, llm: liveLlmEnabled() });
  setDemoCookie(res, newDemoClaims());
  return res;
}

// DELETE: leave demo mode.
export async function DELETE() {
  const res = new NextResponse(null, { status: 204 });
  clearDemoCookie(res);
  return res;
}
