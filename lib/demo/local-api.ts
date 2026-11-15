// In-browser stand-in for the research API while in demo mode.
//
// Every /api/* call the study pages make is answered here from tab-local state instead of
// reaching the research database. Only two calls go to the server, and both go to the
// demo branches of the normal routes (POST /api/cards, POST /api/trigger), which carry the
// state in the request body and never touch Supabase. The topic list (GET /api/topics) is
// read-only and passed through.
//
// Response shapes and validation mirror the real routes so the study pages run unchanged.
// Storage and the server fetch are injected so this module can be tested outside a browser.

import { buildGraph, type DbNode, type EdgeType, type Valence } from "../conviction-graph";
import { computeSignals, type EventRow } from "../signal-processor";
import { computeDebrief } from "../debrief-summary";
import {
  MIN_WORDS_FINAL, MAX_WORDS_FINAL, MIN_WORDS_PROMPT, MAX_WORDS_PROMPT,
  countWords, wordLimitError,
} from "../word-limits";
import { DEMO_ID_PREFIX, DEMO_STORE_KEY, type DemoCondition } from "./shared";

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type ServerFetch = (path: string, init: RequestInit) => Promise<Response>;

interface StoredEvent extends EventRow { created_at: string }

export interface DemoState {
  condition:     DemoCondition;
  participantId: string | null;
  session: {
    id: string; question: string; prior_lean: number | null; prior_reasons: string | null;
    topic_id: string | null; status: "active" | "triggered" | "complete";
    current_lean: number | null; started_at: string; completed_at: string | null;
  } | null;
  nodes:        DbNode[];
  events:       StoredEvent[];
  leanSamples:  { node_id: string | null; lean_value: number; created_at: string }[];
  trigger:      { id: string; prompt: string; fired_at: string; response: string | null } | null;
  rationale:    { text: string; word_count: number } | null;
  finalLean:    number | null;
}

export interface LocalResult { status: number; body: unknown }

const EDGE_TYPES = new Set(["observe_world", "observe_self", "predict_future", "reflect_on_prediction"]);
const VALENCES   = new Set(["supports", "undermines", "neutral"]);
const EVENT_TYPES = new Set([
  "open", "expand", "dwell_start", "dwell_end",
  "endorse", "endorse_weighted", "dismiss", "add_own", "revisit",
  "lean_shift", "commit_intent",
]);

function uid(): string {
  return `${DEMO_ID_PREFIX}${globalThis.crypto.randomUUID()}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function newDemoState(condition: DemoCondition): DemoState {
  return {
    condition, participantId: null, session: null, nodes: [], events: [],
    leanSamples: [], trigger: null, rationale: null, finalLean: null,
  };
}

export function loadDemoState(store: KeyValueStore): DemoState | null {
  try {
    const raw = store.getItem(DEMO_STORE_KEY);
    return raw ? (JSON.parse(raw) as DemoState) : null;
  } catch {
    return null;
  }
}

export function saveDemoState(store: KeyValueStore, state: DemoState): void {
  store.setItem(DEMO_STORE_KEY, JSON.stringify(state));
}

const ok   = (body: unknown, status = 200): LocalResult => ({ status, body });
const fail = (status: number, error: string): LocalResult => ({ status, body: { error } });

/**
 * Handle one /api request locally. `path` is the URL path plus query, e.g.
 * "/api/nodes?session_id=…".
 */
export async function handleDemoRequest(
  method: string,
  path: string,
  rawBody: unknown,
  store: KeyValueStore,
  serverFetch: ServerFetch,
): Promise<LocalResult> {
  const state = loadDemoState(store);
  if (!state) return fail(409, "Demo session not started. Return to the start page.");

  const url  = new URL(path, "http://demo.local");
  const p    = url.pathname.replace(/\/+$/, "");
  const body = (rawBody && typeof rawBody === "object" ? rawBody : {}) as Record<string, unknown>;
  const save = () => saveDemoState(store, state);

  // ── Participants ─────────────────────────────────────────────────────────
  if (method === "POST" && p === "/api/participants") {
    if (!body.age_range || !body.education) return fail(400, "age_range and education are required");
    // Demo condition was chosen in the browser at demo start; the research counter is never used.
    state.participantId = uid();
    save();
    return ok({ participantId: state.participantId, condition: state.condition });
  }
  if (method === "POST" && p === "/api/participants/check") {
    return ok({ alreadyParticipated: false });
  }

  // ── Sessions ─────────────────────────────────────────────────────────────
  if (method === "POST" && p === "/api/sessions") {
    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!body.participant_id || !question) return fail(400, "participant_id and question are required");
    const priorLean = typeof body.prior_lean === "number" ? body.prior_lean : null;
    if (priorLean !== null && (priorLean < -1 || priorLean > 1)) return fail(400, "prior_lean must be between -1 and 1");
    const sid = uid();
    state.session = {
      id: sid, question, prior_lean: priorLean,
      prior_reasons: typeof body.prior_reasons === "string" ? body.prior_reasons : null,
      topic_id: typeof body.topic_id === "string" ? body.topic_id : null,
      status: "active", current_lean: null, started_at: nowIso(), completed_at: null,
    };
    const root: DbNode = {
      id: uid(), session_id: sid, parent_id: null, edge_type: null, valence: "neutral",
      content: question, authored_by: "system", depth: 0, created_at: nowIso(),
    };
    state.nodes = [root];
    state.events = []; state.leanSamples = []; state.trigger = null;
    state.rationale = null; state.finalLean = null;
    save();
    return ok({ sessionId: sid, rootNodeId: root.id }, 201);
  }

  const sessionMatch = p.match(/^\/api\/sessions\/([^/]+)$/);
  if (method === "GET" && sessionMatch) {
    if (!state.session || state.session.id !== sessionMatch[1]) return fail(404, "Session not found");
    return ok({ session: { ...state.session, participant_id: state.participantId }, graph: buildGraph(state.nodes) });
  }

  // Everything below needs the active demo session.
  const s = state.session;

  // ── Nodes ────────────────────────────────────────────────────────────────
  if (method === "GET" && p === "/api/nodes") {
    if (!url.searchParams.get("session_id")) return fail(400, "session_id required");
    return ok(s && url.searchParams.get("session_id") === s.id ? state.nodes : []);
  }
  if (method === "POST" && p === "/api/nodes") {
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!s || body.session_id !== s.id || !content) return fail(400, "session_id and content are required");
    if (body.edge_type && !EDGE_TYPES.has(body.edge_type as string)) return fail(400, "Invalid edge_type");
    const valence = (body.valence ?? "neutral") as string;
    if (!VALENCES.has(valence)) return fail(400, "Invalid valence");
    const authored = (body.authored_by ?? "system") as string;
    if (authored !== "system" && authored !== "user") return fail(400, "Invalid authored_by");
    let depth = 0;
    const parentId = (body.parent_id as string | null | undefined) ?? null;
    if (parentId) {
      const parent = state.nodes.find(n => n.id === parentId);
      if (!parent) return fail(404, "Parent node not found");
      depth = parent.depth + 1;
    }
    const node: DbNode = {
      id: uid(), session_id: s.id, parent_id: parentId,
      edge_type: (body.edge_type as EdgeType | undefined) ?? null,
      valence: valence as Valence, content, authored_by: authored, depth, created_at: nowIso(),
    };
    state.nodes.push(node);
    save();
    return ok(node, 201);
  }
  const nodeMatch = p.match(/^\/api\/nodes\/([^/]+)$/);
  if (nodeMatch && (method === "PATCH" || method === "DELETE")) {
    const idx = state.nodes.findIndex(n => n.id === nodeMatch[1]);
    if (method === "DELETE") {
      if (idx >= 0) state.nodes.splice(idx, 1);
      save();
      return ok(null, 204);
    }
    if (idx < 0) return fail(404, "Node not found or update failed");
    if (typeof body.content === "string") state.nodes[idx].content = body.content.trim();
    if (body.valence !== undefined) {
      if (!VALENCES.has(body.valence as string)) return fail(400, "Invalid valence");
      state.nodes[idx].valence = body.valence as Valence;
    }
    save();
    return ok(state.nodes[idx]);
  }

  // ── Events / lean samples ────────────────────────────────────────────────
  if (method === "POST" && p === "/api/events") {
    if (!s || body.session_id !== s.id) return fail(400, "session_id required");
    if (!EVENT_TYPES.has(body.event_type as string)) return fail(400, `Invalid event_type: ${String(body.event_type)}`);
    const ev: StoredEvent = {
      event_type:       body.event_type as string,
      node_id:          (body.node_id as string | null | undefined) ?? null,
      payload:          (body.payload as Record<string, unknown> | null | undefined) ?? null,
      elapsed_ms:       (body.elapsed_ms as number | null | undefined) ?? null,
      hidden_valence:   (body.hidden_valence as string | null | undefined) ?? null,
      hidden_edge_type: (body.hidden_edge_type as string | null | undefined) ?? null,
      created_at:       nowIso(),
    };
    state.events.push(ev);
    save();
    return ok({ ...ev, id: uid(), session_id: s.id }, 201);
  }
  if (method === "POST" && p === "/api/lean-samples") {
    if (!s || body.session_id !== s.id) return fail(400, "session_id required");
    const v = body.lean_value;
    if (typeof v !== "number" || v < -1 || v > 1) return fail(400, "lean_value must be a number in [-1, 1]");
    const row = { node_id: (body.node_id as string | null | undefined) ?? null, lean_value: v, created_at: nowIso() };
    state.leanSamples.push(row);
    save();
    return ok({ ...row, id: uid(), session_id: s.id }, 201);
  }

  // ── Cards: server demo branch (LLM or canned), state sent in the body ────
  if (method === "POST" && p === "/api/cards") {
    if (!s || body.session_id !== s.id) return fail(404, "Session not found");
    const res = await serverFetch("/api/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ demo: { prior_lean: s.prior_lean, nodes: state.nodes } }),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }

  // ── Trigger ──────────────────────────────────────────────────────────────
  if (method === "POST" && p === "/api/trigger") {
    if (!s || body.session_id !== s.id) return fail(404, "Session not found");
    if (s.status === "complete") return ok({ triggered: false });
    if (state.trigger) {
      return ok({ triggered: true, triggerId: state.trigger.id, prompt: state.trigger.prompt, alreadyFired: true });
    }
    const res = await serverFetch("/api/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        demo: {
          condition:     state.condition,
          question:      s.question,
          prior_lean:    s.prior_lean,
          prior_reasons: s.prior_reasons,
          nodes:         state.nodes,
          events:        state.events,
        },
      }),
    });
    const data = await res.json().catch(() => ({})) as { triggered?: boolean; triggerId?: string; prompt?: string };
    if (res.ok && data.triggered && data.triggerId) {
      state.trigger = { id: data.triggerId, prompt: data.prompt ?? "", fired_at: nowIso(), response: null };
      s.status = "triggered";
      save();
    }
    return { status: res.status, body: data };
  }
  const trigMatch = p.match(/^\/api\/trigger\/([^/]+)$/);
  if (method === "PATCH" && trigMatch) {
    const response = body.response;
    if (!response || typeof response !== "string") return fail(400, "response (string) required");
    const limitErr = wordLimitError(response.trim(), MIN_WORDS_PROMPT, MAX_WORDS_PROMPT);
    if (limitErr) return fail(400, limitErr);
    if (!state.trigger || state.trigger.id !== trigMatch[1]) return fail(500, "Failed to save response");
    state.trigger.response = response.trim();
    save();
    return ok({ id: state.trigger.id, session_id: s?.id, participant_response: state.trigger.response });
  }

  // ── Equilibrium (computed, never stored) ────────────────────────────────
  if (method === "POST" && p === "/api/equilibrium") {
    if (!s || body.session_id !== s.id) return fail(400, "session_id required");
    const signals = computeSignals(state.events, state.nodes, !!state.trigger?.response, s.prior_lean ?? 0);
    return ok({ equilibriumReached: signals.equilibriumReached, signals });
  }

  // ── Final rationale ──────────────────────────────────────────────────────
  if (method === "POST" && p === "/api/rationale") {
    const text = typeof body.text === "string" ? body.text : "";
    if (!body.session_id || !text.trim()) return fail(400, "session_id and text required");
    const limitErr = wordLimitError(text.trim(), MIN_WORDS_FINAL, MAX_WORDS_FINAL);
    if (limitErr) return fail(400, limitErr);
    if (!s || body.session_id !== s.id) return fail(404, "Session not found");
    const lastShift = [...state.events].reverse().find(e => e.event_type === "lean_shift");
    const rawLean   = lastShift?.payload?.lean;
    state.finalLean = typeof rawLean === "number" ? rawLean : (s.prior_lean ?? 0);
    state.rationale = { text: text.trim(), word_count: countWords(text.trim()) };
    s.status = "complete";
    s.completed_at = nowIso();
    s.current_lean = state.finalLean;
    save();
    return ok({ ok: true });
  }

  // ── Debrief ──────────────────────────────────────────────────────────────
  if (method === "GET" && p === "/api/debrief") {
    if (!url.searchParams.get("session_id")) return fail(400, "session_id required");
    if (!s || url.searchParams.get("session_id") !== s.id) return fail(404, "Session not found");
    return ok(computeDebrief({
      session:         { prior_lean: s.prior_lean, started_at: s.started_at },
      rawEvents:       state.events,
      rawNodes:        state.nodes,
      rawSamples:      state.leanSamples,
      promptEventData: state.trigger
        ? { fired_at: state.trigger.fired_at, prompt_text: state.trigger.prompt, response_text: state.trigger.response }
        : null,
      outcomeData:     state.rationale ? { final_lean: state.finalLean } : null,
    }));
  }

  // ── Mailing list: not offered in the demo ────────────────────────────────
  if (p === "/api/mailing-list") return fail(403, "Not available in the demo.");

  return fail(404, "Not available in the demo.");
}
