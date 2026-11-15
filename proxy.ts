import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE } from "@/lib/demo/shared";

// Demo-mode chokepoint. Any request that carries the demo cookie may reach only the
// routes below; every other API route (all research reads and writes, and the mailing
// list) is refused before it runs. Each research route also re-checks (rejectIfDemo),
// so this is not the only line of defence.
const DEMO_ALLOWED: { method: string; path: string }[] = [
  { method: "POST",   path: "/api/demo" },
  { method: "DELETE", path: "/api/demo" },
  { method: "GET",    path: "/api/topics" },   // read-only list of topic titles
  { method: "POST",   path: "/api/cards" },    // demo branch: no DB access
  { method: "POST",   path: "/api/trigger" },  // demo branch: no DB access
];

export function proxy(req: NextRequest) {
  if (!req.cookies.has(DEMO_COOKIE)) return NextResponse.next();

  const path = req.nextUrl.pathname.replace(/\/+$/, "");
  const ok = DEMO_ALLOWED.some(r => r.method === req.method && r.path === path);
  if (ok) return NextResponse.next();

  return NextResponse.json(
    { error: "Research routes are disabled in demo mode; no data is saved.", code: "demo_mode" },
    { status: 403 },
  );
}

export const config = {
  matcher: "/api/:path*",
};
