// Browser-only: while demo mode is active, answer same-origin /api/* calls from the local
// demo store (lib/demo/local-api.ts) so the unchanged study pages never reach a research
// route. Installed once, at module load, before any page effect runs. Outside demo mode
// every call passes straight through.
//
// This is a convenience layer, not the security boundary: the server refuses research
// routes for any request carrying the demo cookie (proxy.ts + rejectIfDemo).

import { handleDemoRequest } from "./local-api";
import { isDemoActive } from "./client";

// Calls that go to the real server even in demo mode. Everything else under /api is local.
const PASS_THROUGH = new Set(["/api/demo", "/api/topics"]);

let installed = false;

export function installDemoFetchShim(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const realFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (!isDemoActive()) return realFetch(input, init);

    const req = input instanceof Request ? input : null;
    const url = new URL(req ? req.url : String(input), window.location.href);
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) {
      return realFetch(input, init);
    }
    if (PASS_THROUGH.has(url.pathname.replace(/\/+$/, ""))) return realFetch(input, init);

    const method = (init?.method ?? req?.method ?? "GET").toUpperCase();
    let body: unknown = null;
    const rawBody = init?.body ?? (req ? await req.clone().text() : null);
    if (typeof rawBody === "string" && rawBody) {
      try { body = JSON.parse(rawBody); } catch { body = null; }
    }

    const result = await handleDemoRequest(
      method,
      url.pathname + url.search,
      body,
      sessionStorage,
      (path, i) => realFetch(path, { ...i, credentials: "same-origin" }),
    );
    return result.status === 204
      ? new Response(null, { status: 204 })
      : new Response(JSON.stringify(result.body), {
          status:  result.status,
          headers: { "Content-Type": "application/json" },
        });
  };
}
