import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE } from "@/lib/demo/shared";

// API chokepoint. Each route re-checks the same rules (guardResearch / demo branches), so
// this is not the only line of defence.
//
// 1. Demo mode (demo cookie present): only the routes below may run. Every research route,
//    and the mailing list, is refused before it runs.
// 2. Study closed (STUDY_OPEN !== "true", the default): every API route except the demo
//    routes and the read-only topic list is refused. /api/cards and /api/trigger pass here
//    because they serve the demo; their research branch checks STUDY_OPEN itself.
const DEMO_ALLOWED: { method: string; path: string }[] = [
  { method: "POST",   path: "/api/demo" },
  { method: "DELETE", path: "/api/demo" },
  { method: "GET",    path: "/api/topics" },   // read-only list of topic titles
  { method: "POST",   path: "/api/cards" },    // demo branch: no DB access
  { method: "POST",   path: "/api/trigger" },  // demo branch: no DB access
];

function refuse(error: string, code: string) {
  return NextResponse.json({ error, code }, { status: 403 });
}

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname.replace(/\/+$/, "");
  const allowedForDemo = DEMO_ALLOWED.some(r => r.method === req.method && r.path === path);

  if (req.cookies.has(DEMO_COOKIE)) {
    return allowedForDemo
      ? NextResponse.next()
      : refuse("Research routes are disabled in demo mode; no data is saved.", "demo_mode");
  }

  if (process.env.STUDY_OPEN !== "true" && !allowedForDemo) {
    return refuse("This study is closed and is no longer accepting participants.", "study_closed");
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
