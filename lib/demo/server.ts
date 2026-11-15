// Server-only: demo-mode branches of /api/cards and /api/trigger.
//
// Demo requests carry their own (client-held) graph state in the body. Nothing here touches
// Supabase. The trigger decision reuses computeSignals + shouldTrigger unchanged, and the
// prompt reuses generateDissonancePrompt unchanged (or the canned fallback), so the demo
// behaves like the study without ever reading or writing research tables.

import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { buildGraph, type DbNode, type EdgeType, type Valence } from "../conviction-graph";
import { generateCards } from "../card-generator";
import { generateDissonancePrompt } from "../dissonance-prompt";
import { computeSignals, type EventRow } from "../signal-processor";
import { shouldTrigger, type Condition } from "../trigger-engine";
import { cannedCards } from "./canned";
import { clientIp, takeLlmBudget } from "./limits";
import { DEMO_CANNED_PROMPT } from "./shared";
import { setDemoCookie, type DemoClaims } from "./token";

// Size caps: demo state is user-supplied and part of it is sent to the LLM.
const MAX_NODES       = 80;
const MAX_EVENTS      = 1500;
const MAX_TEXT        = 1200;
const MAX_QUESTION    = 300;

const EDGE_TYPES = new Set(["observe_world", "observe_self", "predict_future", "reflect_on_prediction"]);
const VALENCES   = new Set(["supports", "undermines", "neutral"]);
const CONDITIONS = new Set<Condition>(["anticipatory", "reactive", "random", "silent"]);

class BadDemoInput extends Error {}

function str(v: unknown, max: number): string {
  if (typeof v !== "string") throw new BadDemoInput("expected string");
  return v.slice(0, max);
}

function lean(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
}

function parseNodes(v: unknown): DbNode[] {
  if (!Array.isArray(v) || v.length === 0 || v.length > MAX_NODES) throw new BadDemoInput("nodes");
  return v.map((n: Record<string, unknown>) => ({
    id:          str(n.id, 64),
    session_id:  str(n.session_id, 64),
    parent_id:   n.parent_id == null ? null : str(n.parent_id, 64),
    edge_type:   EDGE_TYPES.has(n.edge_type as string) ? (n.edge_type as EdgeType) : null,
    valence:     VALENCES.has(n.valence as string) ? (n.valence as Valence) : "neutral",
    content:     str(n.content, MAX_TEXT),
    authored_by: n.authored_by === "user" ? "user" : "system",
    depth:       typeof n.depth === "number" ? n.depth : 0,
    created_at:  typeof n.created_at === "string" ? n.created_at : new Date().toISOString(),
  }));
}

/** Keep only the numeric payload fields the signal code reads (lean, weight). */
function numericPayload(p: unknown): Record<string, unknown> | null {
  if (!p || typeof p !== "object") return null;
  const src = p as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (typeof src.lean === "number" && Number.isFinite(src.lean))     out.lean   = lean(src.lean);
  if (typeof src.weight === "number" && Number.isFinite(src.weight)) out.weight = src.weight;
  return out;
}

function parseEvents(v: unknown): EventRow[] {
  if (!Array.isArray(v) || v.length > MAX_EVENTS) throw new BadDemoInput("events");
  return v.map((e: Record<string, unknown>) => ({
    event_type:       str(e.event_type, 32),
    node_id:          e.node_id == null ? null : str(e.node_id, 64),
    payload:          numericPayload(e.payload),
    elapsed_ms:       typeof e.elapsed_ms === "number" ? e.elapsed_ms : null,
    hidden_valence:   VALENCES.has(e.hidden_valence as string) ? (e.hidden_valence as string) : null,
    hidden_edge_type: EDGE_TYPES.has(e.hidden_edge_type as string) ? (e.hidden_edge_type as string) : null,
  }));
}

async function readDemoBody(req: NextRequest): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => null) as { demo?: unknown } | null;
  if (!body || typeof body.demo !== "object" || body.demo === null) throw new BadDemoInput("demo body");
  return body.demo as Record<string, unknown>;
}

function badRequest(): NextResponse {
  return NextResponse.json({ error: "Invalid demo request" }, { status: 400 });
}

/** POST /api/cards in demo mode. */
export async function demoCards(req: NextRequest, claims: DemoClaims): Promise<NextResponse> {
  let nodes: DbNode[];
  let priorLean: number;
  try {
    const demo = await readDemoBody(req);
    nodes     = parseNodes(demo.nodes);
    priorLean = lean(demo.prior_lean);
  } catch {
    return badRequest();
  }

  const root = buildGraph(nodes);
  if (!root) return NextResponse.json({ error: "Could not build graph" }, { status: 422 });

  const budget = takeLlmBudget(clientIp(req), claims.sid, claims.n);
  let source: "live" | "canned" = "canned";
  let cards = cannedCards(new Set(nodes.map(n => n.content)), nodes.length);
  if (budget.ok) {
    try {
      cards  = await generateCards(root, priorLean);
      source = "live";
    } catch {
      // fall back to canned cards
    }
  }

  const res = NextResponse.json({ cards, demo: true, source });
  setDemoCookie(res, { ...claims, n: budget.n });
  return res;
}

/** POST /api/trigger in demo mode. */
export async function demoTrigger(req: NextRequest, claims: DemoClaims): Promise<NextResponse> {
  let nodes: DbNode[];
  let events: EventRow[];
  let condition: Condition;
  let question: string;
  let priorLean: number;
  let priorReasons: string | null;
  try {
    const demo = await readDemoBody(req);
    if (!CONDITIONS.has(demo.condition as Condition)) throw new BadDemoInput("condition");
    condition    = demo.condition as Condition;
    nodes        = parseNodes(demo.nodes);
    events       = parseEvents(demo.events);
    question     = str(demo.question, MAX_QUESTION);
    priorLean    = lean(demo.prior_lean);
    priorReasons = demo.prior_reasons == null ? null : str(demo.prior_reasons, MAX_TEXT);
  } catch {
    return badRequest();
  }

  // Same decision code as the research route.
  const signals = computeSignals(events, nodes, false, priorLean);
  if (!shouldTrigger(condition, signals, events, false)) {
    return NextResponse.json({ triggered: false, signals, demo: true });
  }

  const budget = takeLlmBudget(clientIp(req), claims.sid, claims.n);
  let prompt = DEMO_CANNED_PROMPT;
  let source: "live" | "canned" = "canned";
  const root = buildGraph(nodes);
  if (budget.ok && root) {
    try {
      prompt = await generateDissonancePrompt(
        { question, prior_lean: priorLean, prior_reasons: priorReasons },
        root, signals, events, nodes,
      );
      source = "live";
    } catch {
      prompt = DEMO_CANNED_PROMPT;
    }
  }

  const res = NextResponse.json({
    triggered: true,
    triggerId: `demo-${randomUUID()}`,
    prompt,
    signals,
    demo:      true,
    source,
  });
  setDemoCookie(res, { ...claims, n: budget.n });
  return res;
}
