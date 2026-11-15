// Demo-isolation and research-path regression test.
//
//   npm run test:demo                       # test this checkout
//   npm run test:demo -- --pilot <dir>      # also diff the research path against another
//                                           # checkout (e.g. a worktree of tag v1.0-pilot)
//
// Starts the real Next.js app (next dev) against an in-memory mock of Supabase PostgREST and
// the Anthropic API. No network, no real database, no real API key. Every env var the app
// reads is set explicitly here, and process.env takes precedence over .env files, so a local
// .env.local is never used. The run aborts unless the mock itself serves the first DB read.
//
// Proves:
//   1. A full demo run (both pilot conditions) writes ZERO rows to any research table, makes
//      no research-table request at all, and does not consume the condition counter.
//   2. Every research route refuses requests carrying the demo cookie (403), and demo
//      payloads without a valid cookie are refused (401).
//   3. Demo LLM usage is capped per session and per IP, and replaying an older cookie does
//      not reset the cap; canned content is served once over budget.
//   4. The Prolific path still writes the same rows, makes the same DB requests and returns
//      the same responses as before (exact diff against --pilot when given), including the
//      count % 2 condition alternation and the duplicate-participant rejection.

import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import net from "node:net";
import { MockBackend, type RecordedRequest } from "./mock-backend";
import { handleDemoRequest, loadDemoState, newDemoState, saveDemoState, type KeyValueStore } from "../../lib/demo/local-api";
import { DEMO_CANNED_PROMPT, type DemoCondition } from "../../lib/demo/shared";

const RESEARCH_TABLES = [
  "participants", "sessions", "nodes", "events", "lean_samples", "prompt_events",
  "triggers", "final_rationale", "session_outcome", "outcomes", "mailing_list",
];

// ── tiny assertion helpers ──────────────────────────────────────────────────
let failures = 0;
let passes = 0;
function check(cond: unknown, msg: string) {
  if (cond) { passes++; console.log(`  ✓ ${msg}`); }
  else      { failures++; console.log(`  ✗ ${msg}`); }
}

// ── app server management ───────────────────────────────────────────────────
function freePort(): Promise<number> {
  return new Promise(resolve => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(p));
    });
  });
}

interface App { base: string; proc: ChildProcess; output: () => string }

async function startApp(appDir: string, mockUrl: string, extraEnv: Record<string, string>): Promise<App> {
  const port = await freePort();
  // Built from scratch: nothing from the caller's environment that could point at real services.
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_SUPABASE_URL:      mockUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
    SUPABASE_SERVICE_ROLE_KEY:     "test-service-role-key",
    ANTHROPIC_API_KEY:             "test-anthropic-key",
    ANTHROPIC_BASE_URL:            mockUrl,
    ANTHROPIC_MODEL:               "mock-model",
    NEXT_PUBLIC_PROLIFIC_COMPLETION_CODE: "TESTCODE",
    DEMO_TOKEN_SECRET:             "test-demo-secret-0123456789abcdef",
    DEMO_LLM_ENABLED:              "",
    DEMO_MAX_LLM_CALLS_PER_SESSION: "",
    DEMO_MAX_LLM_CALLS_PER_IP_PER_HOUR: "",
    DEMO_MAX_LLM_CALLS_PER_DAY:    "",
    ...extraEnv,
  };
  const nextBin = path.join(appDir, "node_modules", ".bin", "next");
  let out = "";
  const proc = spawn(nextBin, ["dev", "--port", String(port), "--hostname", "127.0.0.1"], { cwd: appDir, env: env as unknown as NodeJS.ProcessEnv, stdio: ["ignore", "pipe", "pipe"] });
  proc.stdout.on("data", (d: Buffer) => { out += d; });
  proc.stderr.on("data", (d: Buffer) => { out += d; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 240; i++) {
    try {
      const r = await fetch(`${base}/api/topics`);
      if (r.status === 200) return { base, proc, output: () => out };
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 500));
  }
  proc.kill();
  throw new Error(`app in ${appDir} did not start:\n${out.slice(-3000)}`);
}

function stopApp(app: App) {
  app.proc.kill("SIGTERM");
}

// ── HTTP helper with a one-cookie jar ───────────────────────────────────────
interface Res { status: number; json: unknown; setCookie: string | null }
async function api(base: string, method: string, p: string, body?: unknown, cookie?: string): Promise<Res> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers["Cookie"] = cookie;
  const r = await fetch(base + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  const sc = r.headers.get("set-cookie");
  return { status: r.status, json, setCookie: sc ? sc.split(";")[0] : null };
}

// ── normalisation for exact before/after comparison ─────────────────────────
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const ISO  = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g;
function norm(v: unknown): unknown {
  if (typeof v === "string") return v.replace(UUID, "<uuid>").replace(ISO, "<ts>");
  if (Array.isArray(v)) return v.map(norm);
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      o[k] = /elapsed_s$/.test(k) ? "<secs>" : norm((v as Record<string, unknown>)[k]);
    }
    return o;
  }
  return v;
}
function dbLogByStep(log: RecordedRequest[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const r of log) {
    (out[r.step] ??= []).push(JSON.stringify(norm({ m: r.method, t: r.table, q: decodeURIComponent(r.query), b: r.body })));
  }
  for (const k of Object.keys(out)) out[k].sort(); // Promise.all ordering is not deterministic
  return out;
}

// ── seed data ───────────────────────────────────────────────────────────────
function seed(mock: MockBackend) {
  mock.seed("topics", [
    { title: "Remote work is better for productivity", description: "Is it?" },
    { title: "AI will eliminate more jobs than it creates", description: "Will it?" },
  ]);
  // 41 existing participants: the next research participant gets CONDITIONS[41 % 2] = reactive,
  // so the scripted session exercises the trigger path (triggers + prompt_events + response).
  mock.seed("participants", Array.from({ length: 41 }, (_, i) => ({
    condition: i % 2 === 0 ? "anticipatory" : "reactive", age_range: "25–34", education: "Some college",
    prolific_pid: `seeded${i}`,
  })));
}

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

// ── Prolific (research) scenario: identical steps for pilot and branch ─────
interface ScenarioOut { responses: Record<string, unknown>; conditions: string[] }
async function prolificScenario(base: string, mock: MockBackend): Promise<ScenarioOut> {
  const responses: Record<string, unknown> = {};
  const step = async (name: string, method: string, p: string, body?: unknown) => {
    mock.step = `prolific:${name}`;
    const r = await api(base, method, p, body);
    responses[name] = { status: r.status, json: norm(r.json) };
    return r;
  };
  const pid = "5f00000000000000000000aa"; // fake 24-hex Prolific-style ID

  const topics = (await step("topics", "GET", "/api/topics")).json as { topics: { id: string; title: string }[] };
  await step("check", "POST", "/api/participants/check", { prolific_pid: pid });
  const p1 = (await step("participant1", "POST", "/api/participants", {
    age_range: "25–34", education: "Some college", prolific_pid: pid, prolific_study_id: "study1", prolific_session_id: "sess1",
  })).json as { participantId: string; condition: string };
  const sess = (await step("session", "POST", "/api/sessions", {
    participant_id: p1.participantId, question: topics.topics[0].title, prior_lean: 0.5,
    prior_reasons: "Because I am more focused at home.", topic_id: topics.topics[0].id,
  })).json as { sessionId: string; rootNodeId: string };
  const sid = sess.sessionId;
  await step("sessionGet", "GET", `/api/sessions/${sid}`);
  await step("nodesGet", "GET", `/api/nodes?session_id=${sid}`);
  const cards = ((await step("cards", "POST", "/api/cards", { session_id: sid })).json as { cards: { edge_type: string; valence: string; content: string }[] }).cards;

  for (let i = 0; i < 3; i++) {
    const c = cards[i % cards.length];
    const node = (await step(`endorse${i}:node`, "POST", "/api/nodes", {
      session_id: sid, parent_id: sess.rootNodeId, edge_type: c.edge_type, valence: c.valence, content: `${c.content} #${i}`, authored_by: "system",
    })).json as { id: string };
    await step(`endorse${i}:event`, "POST", "/api/events", {
      session_id: sid, node_id: node.id, event_type: "endorse", payload: { weight: 2 }, elapsed_ms: 1000 * (i + 1),
      hidden_valence: c.valence, hidden_edge_type: c.edge_type,
    });
    await step(`endorse${i}:shift`, "POST", "/api/events", {
      session_id: sid, node_id: null, event_type: "lean_shift", payload: { lean: 0.6 + i * 0.1 }, elapsed_ms: 1000 * (i + 1) + 500,
    });
    await step(`endorse${i}:lean`, "POST", "/api/lean-samples", { session_id: sid, node_id: node.id, lean_value: 0.6 + i * 0.1 });
    await step(`endorse${i}:trigger`, "POST", "/api/trigger", { session_id: sid });
  }
  await step("dismiss", "POST", "/api/events", {
    session_id: sid, node_id: null, event_type: "dismiss", payload: null, elapsed_ms: 5000,
    hidden_valence: "undermines", hidden_edge_type: "observe_world",
  });
  await step("commit", "POST", "/api/events", {
    session_id: sid, node_id: null, event_type: "commit_intent", payload: { lean: 0.8 }, elapsed_ms: 6000,
  });
  const trig = (await step("commitTrigger", "POST", "/api/trigger", { session_id: sid })).json as { triggered?: boolean; triggerId?: string };
  if (trig.triggered && trig.triggerId) {
    await step("promptResponse", "PATCH", `/api/trigger/${trig.triggerId}`, { response: words(30) });
  }
  await step("equilibrium", "POST", "/api/equilibrium", { session_id: sid });
  await step("rationale", "POST", "/api/rationale", { session_id: sid, text: words(60) });
  await step("debrief", "GET", `/api/debrief?session_id=${sid}`);
  await step("mailing", "POST", "/api/mailing-list", { email: "someone@example.com" });
  await step("duplicate", "POST", "/api/participants", { age_range: "25–34", education: "Some college", prolific_pid: pid });
  const p2 = (await step("participant2", "POST", "/api/participants", {
    age_range: "18–24", education: "Bachelor's degree", prolific_pid: "5f00000000000000000000bb",
  })).json as { condition: string };
  mock.step = "idle";
  return { responses, conditions: [p1.condition, p2.condition] };
}

// ── Demo scenario: drives lib/demo/local-api.ts exactly as the browser shim does ──
class MemStore implements KeyValueStore {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
}

async function startDemo(base: string): Promise<string> {
  const r = await api(base, "POST", "/api/demo");
  if (r.status !== 200 || !r.setCookie) throw new Error(`demo start failed: ${r.status}`);
  return r.setCookie;
}

async function demoRun(base: string, condition: DemoCondition) {
  let cookie = await startDemo(base);
  const store = new MemStore();
  saveDemoState(store, newDemoState(condition));
  const serverCalls: string[] = [];
  const serverFetch = async (p: string, init: RequestInit) => {
    serverCalls.push(`${init.method} ${p}`);
    const r = await fetch(base + p, { ...init, headers: { ...(init.headers as Record<string, string>), Cookie: cookie } });
    const sc = r.headers.get("set-cookie");
    if (sc) cookie = sc.split(";")[0];
    return r;
  };
  const call = (m: string, p: string, b?: unknown) => handleDemoRequest(m, p, b ?? null, store, serverFetch);

  // Mirrors the page sequence: onboard → lobby → explore → rationale → debrief.
  const part = (await call("POST", "/api/participants", { age_range: "25–34", education: "Some college" })).body as { participantId: string; condition: string };
  const sess = (await call("POST", "/api/sessions", { participant_id: part.participantId, question: "Remote work is better for productivity", prior_lean: 0.5, prior_reasons: "Fewer interruptions." })).body as { sessionId: string; rootNodeId: string };
  const sid = sess.sessionId;
  await call("GET", `/api/sessions/${sid}`);
  await call("GET", `/api/nodes?session_id=${sid}`);
  const cardsRes = await call("POST", "/api/cards", { session_id: sid });
  const cards = (cardsRes.body as { cards: { edge_type: string; valence: string; content: string }[] }).cards ?? [];
  await call("POST", "/api/trigger", { session_id: sid }); // restore check on explore mount
  let earlyFire = false;
  for (let i = 0; i < 4; i++) {
    const c = cards[i % Math.max(cards.length, 1)] ?? { edge_type: "observe_world", valence: "supports", content: "x" };
    const node = (await call("POST", "/api/nodes", { session_id: sid, parent_id: sess.rootNodeId, edge_type: c.edge_type, valence: "supports", content: `${c.content} ${i}`, authored_by: "system" })).body as { id: string };
    await call("POST", "/api/events", { session_id: sid, node_id: node.id, event_type: "endorse_weighted", payload: { weight: 3 }, elapsed_ms: 1000 * i, hidden_valence: "supports", hidden_edge_type: c.edge_type });
    await call("POST", "/api/events", { session_id: sid, node_id: null, event_type: "lean_shift", payload: { lean: 0.55 + 0.03 * i }, elapsed_ms: 1000 * i + 400 });
    await call("POST", "/api/lean-samples", { session_id: sid, node_id: node.id, lean_value: 0.55 + 0.03 * i });
    await call("POST", "/api/nodes", { session_id: sid, parent_id: sess.rootNodeId, edge_type: "observe_world", valence: "undermines", content: `counter ${i}`, authored_by: "system" });
    await call("POST", "/api/events", { session_id: sid, node_id: null, event_type: "dismiss", payload: null, elapsed_ms: 1000 * i + 700, hidden_valence: "undermines", hidden_edge_type: "observe_world" });
    await call("POST", "/api/cards", { session_id: sid });
    const t = (await call("POST", "/api/trigger", { session_id: sid })).body as { triggered?: boolean; alreadyFired?: boolean };
    if (t.triggered && !t.alreadyFired) earlyFire = true;
  }
  await call("POST", "/api/events", { session_id: sid, node_id: null, event_type: "commit_intent", payload: { lean: 0.64 }, elapsed_ms: 9000 });
  const commit = (await call("POST", "/api/trigger", { session_id: sid })).body as { triggered?: boolean; triggerId?: string; prompt?: string; alreadyFired?: boolean };
  const state = loadDemoState(store)!;
  const triggerId = commit.triggerId ?? state.trigger?.id;
  const shortResp = triggerId ? await call("PATCH", `/api/trigger/${triggerId}`, { response: words(5) }) : null;
  const okResp    = triggerId ? await call("PATCH", `/api/trigger/${triggerId}`, { response: words(30) }) : null;
  await call("POST", "/api/equilibrium", { session_id: sid });
  const ration = await call("POST", "/api/rationale", { session_id: sid, text: words(60) });
  const debrief = (await call("GET", `/api/debrief?session_id=${sid}`)).body as { promptFired: boolean; promptText: string | null; initialLean: number; finalLean: number };
  const mailing = await call("POST", "/api/mailing-list", { email: "a@b.co" });
  return { cardsRes, earlyFire, commit, shortResp, okResp, ration, debrief, mailing, serverCalls, cookie, prompt: state.trigger?.prompt ?? commit.prompt };
}

// ── main ───────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const appDir   = path.resolve(args.includes("--app") ? args[args.indexOf("--app") + 1] : ".");
  const pilotDir = args.includes("--pilot") ? path.resolve(args[args.indexOf("--pilot") + 1]) : null;
  const apps: App[] = [];

  try {
    // ── Run 1: branch app, live LLM disabled (production default) ─────────
    console.log(`\n[1] Demo isolation  (app: ${appDir}, DEMO_LLM_ENABLED unset)`);
    const mock = new MockBackend();
    const mockUrl = await mock.start();
    seed(mock);
    const app = await startApp(appDir, mockUrl, {});
    apps.push(app);
    if (!mock.log.some(r => r.table === "topics")) throw new Error("app is not talking to the mock DB; aborting");

    mock.step = "demo";
    const before = Object.fromEntries(RESEARCH_TABLES.map(t => [t, JSON.stringify(mock.rows(t))]));

    // Every research route must refuse a request that carries the demo cookie.
    const cookie = await startDemo(app.base);
    const fakeId = "00000000-0000-4000-8000-000000000000";
    const research: [string, string, unknown?][] = [
      ["POST", "/api/participants", { age_range: "x", education: "y", prolific_pid: "test1" }],
      ["POST", "/api/participants/check", { prolific_pid: "abc" }],
      ["POST", "/api/sessions", { participant_id: fakeId, question: "q" }],
      ["GET",  `/api/sessions/${fakeId}`],
      ["GET",  `/api/nodes?session_id=${fakeId}`],
      ["POST", "/api/nodes", { session_id: fakeId, content: "c" }],
      ["PATCH", `/api/nodes/${fakeId}`, { content: "c" }],
      ["DELETE", `/api/nodes/${fakeId}`],
      ["POST", "/api/events", { session_id: fakeId, event_type: "open" }],
      ["POST", "/api/lean-samples", { session_id: fakeId, lean_value: 0 }],
      ["PATCH", `/api/trigger/${fakeId}`, { response: words(30) }],
      ["POST", "/api/rationale", { session_id: fakeId, text: words(60) }],
      ["POST", "/api/equilibrium", { session_id: fakeId }],
      ["GET",  `/api/debrief?session_id=${fakeId}`],
      ["POST", "/api/mailing-list", { email: "a@b.co" }],
      ["GET",  "/api/cards/test"],
      ["GET",  "/api/trigger"],
    ];
    const statuses: string[] = [];
    for (const [m, p, b] of research) {
      const r = await api(app.base, m, p, b, cookie);
      statuses.push(`${r.status}`);
      check(r.status === 403, `demo cookie → ${m} ${p.split("?")[0]} refused (got ${r.status})`);
    }
    // The route-level guard (not only proxy.ts) also refuses, even with an invalid cookie value.
    const forged = await api(app.base, "POST", "/api/participants", { age_range: "x", education: "y", prolific_pid: "test2" }, "kairos_demo=forged");
    check(forged.status === 403, `forged demo cookie → research route refused (got ${forged.status})`);
    const forgedCards = await api(app.base, "POST", "/api/cards", { demo: { nodes: [] } }, "kairos_demo=forged");
    check(forgedCards.status === 401, `forged demo cookie → demo branch refused (got ${forgedCards.status})`);
    const noCookie = await api(app.base, "POST", "/api/trigger", { demo: { condition: "reactive" } });
    check(noCookie.status === 401, `demo payload without cookie → refused before DB (got ${noCookie.status})`);

    // Full demo runs for both pilot conditions.
    for (const condition of ["reactive", "anticipatory"] as DemoCondition[]) {
      const run = await demoRun(app.base, condition);
      console.log(`  · ${condition}: server calls = ${[...new Set(run.serverCalls)].join(", ")}`);
      check(run.cardsRes.status === 200 && (run.cardsRes.body as { source?: string }).source === "canned", `${condition}: canned cards served (LLM disabled)`);
      check(run.serverCalls.every(c => c === "POST /api/cards" || c === "POST /api/trigger"), `${condition}: browser only calls the demo branches of /api/cards and /api/trigger`);
      check(run.shortResp?.status === 400, `${condition}: prompt response word minimum enforced (same limits as study)`);
      check(run.ration.status === 200, `${condition}: rationale accepted locally`);
      check(run.mailing.status === 403, `${condition}: mailing list unavailable in demo`);
      if (condition === "reactive") {
        check(!run.earlyFire, "reactive: no prompt before commit");
        check(run.commit.triggered === true && !run.commit.alreadyFired, "reactive: prompt fires after \"I've reached my position\"");
      }
      if (run.debrief.promptFired) check(run.prompt === DEMO_CANNED_PROMPT, `${condition}: prompt text is the condition-independent canned prompt`);
      check(typeof run.debrief.initialLean === "number" && typeof run.debrief.finalLean === "number", `${condition}: debrief portrait computed`);
    }

    const demoLog = mock.log.filter(r => r.step === "demo");
    const demoResearch = demoLog.filter(r => RESEARCH_TABLES.includes(r.table));
    check(demoResearch.length === 0, `demo phase made 0 requests to research tables (made ${demoResearch.length})`);
    check(demoLog.every(r => r.table === "topics" && r.method === "GET"), `demo phase DB traffic is only GET topics (${demoLog.length} requests)`);
    check(demoLog.filter(r => r.table === "anthropic").length === 0, "demo phase made 0 Anthropic calls with DEMO_LLM_ENABLED unset");
    const changed = RESEARCH_TABLES.filter(t => JSON.stringify(mock.rows(t)) !== before[t]);
    check(changed.length === 0, `research tables unchanged after demo runs (changed: ${changed.join(", ") || "none"})`);

    // Research path on the same server, after the demo: the counter was not advanced.
    console.log("\n[2] Prolific path after demo runs (same server)");
    const branchMockLogStart = mock.log.length;
    const branch = await prolificScenario(app.base, mock);
    check(branch.conditions[0] === "reactive", `first Prolific participant after demos gets CONDITIONS[41 % 2] = reactive, i.e. demos did not advance the counter (got ${branch.conditions[0]})`);
    check(branch.conditions[1] === "anticipatory", `next one alternates to anticipatory (got ${branch.conditions[1]})`);
    check((branch.responses.commitTrigger as { json: { triggered?: boolean } }).json.triggered === true, "reactive Prolific session: prompt fires after commit");
    const written = RESEARCH_TABLES.filter(t => JSON.stringify(mock.rows(t)) !== before[t]);
    for (const t of ["participants", "sessions", "nodes", "events", "lean_samples", "triggers", "prompt_events", "final_rationale", "session_outcome", "mailing_list"]) {
      check(written.includes(t), `Prolific run writes ${t}`);
    }
    check((branch.responses.duplicate as { status: number }).status === 409, "duplicate Prolific ID rejected (409)");
    const mailRow = mock.rows("mailing_list")[0] ?? {};
    check(!("session_id" in mailRow) && Object.keys(mailRow).sort().join() === "created_at,email,id", "mailing_list row holds only email (+ id, created_at), no session link");
    const branchLog = dbLogByStep(mock.log.slice(branchMockLogStart));
    stopApp(app); apps.pop();
    await mock.stop();

    // ── Run 2: exact diff of the research path against the pilot checkout ──
    if (pilotDir) {
      console.log(`\n[3] Research-path regression vs pilot (${pilotDir})`);
      const pm = new MockBackend();
      const pmUrl = await pm.start();
      seed(pm);
      const papp = await startApp(pilotDir, pmUrl, {});
      apps.push(papp);
      const start = pm.log.length;
      const pilot = await prolificScenario(papp.base, pm);
      const pilotLog = dbLogByStep(pm.log.slice(start));
      stopApp(papp); apps.pop();
      await pm.stop();

      const steps = [...new Set([...Object.keys(pilotLog), ...Object.keys(branchLog)])];
      const dbDiff = steps.filter(s => JSON.stringify(pilotLog[s]) !== JSON.stringify(branchLog[s]));
      check(dbDiff.length === 0, `identical DB requests per step (${steps.length} steps; differing: ${dbDiff.join(", ") || "none"})`);
      for (const s of dbDiff) console.log(`      ${s}\n        pilot : ${JSON.stringify(pilotLog[s])}\n        branch: ${JSON.stringify(branchLog[s])}`);
      const respDiff = Object.keys(pilot.responses).filter(k => JSON.stringify(pilot.responses[k]) !== JSON.stringify(branch.responses[k]));
      check(respDiff.length === 0, `identical API responses per step (${Object.keys(pilot.responses).length} steps; differing: ${respDiff.join(", ") || "none"})`);
      for (const k of respDiff) console.log(`      ${k}\n        pilot : ${JSON.stringify(pilot.responses[k])}\n        branch: ${JSON.stringify(branch.responses[k])}`);
      check(JSON.stringify(pilot.conditions) === JSON.stringify(branch.conditions), `same condition sequence (${pilot.conditions.join(" → ")})`);
    }

    // ── Run 3: live LLM enabled with small caps ───────────────────────────
    console.log("\n[4] Demo LLM caps  (DEMO_LLM_ENABLED=true, 3/session, 5/IP/hour)");
    const lm = new MockBackend();
    const lmUrl = await lm.start();
    seed(lm);
    const lapp = await startApp(appDir, lmUrl, {
      DEMO_LLM_ENABLED: "true", DEMO_MAX_LLM_CALLS_PER_SESSION: "3", DEMO_MAX_LLM_CALLS_PER_IP_PER_HOUR: "5", DEMO_MAX_LLM_CALLS_PER_DAY: "100",
    });
    apps.push(lapp);
    lm.step = "demo-llm";
    const cardsBody = { demo: { prior_lean: 0.4, nodes: [{ id: "demo-root", session_id: "demo-s", parent_id: null, edge_type: null, valence: "neutral", content: "Remote work is better", authored_by: "system", depth: 0, created_at: new Date().toISOString() }] } };
    const first = await startDemo(lapp.base);
    let c1 = first;
    const sources1: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await api(lapp.base, "POST", "/api/cards", cardsBody, c1);
      sources1.push((r.json as { source: string }).source);
      if (r.setCookie) c1 = r.setCookie;
    }
    check(sources1.join() === "live,live,live,canned,canned", `per-session cap: ${sources1.join(", ")}`);
    const replay = await api(lapp.base, "POST", "/api/cards", cardsBody, first);
    check((replay.json as { source: string }).source === "canned", "replaying the original (n=0) cookie does not reset the session cap");
    let c2 = await startDemo(lapp.base);
    const sources2: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await api(lapp.base, "POST", "/api/cards", cardsBody, c2);
      sources2.push((r.json as { source: string }).source);
      if (r.setCookie) c2 = r.setCookie;
    }
    check(sources2.join() === "live,live,canned", `per-IP cap across sessions: ${sources2.join(", ")}`);
    const trig = await api(lapp.base, "POST", "/api/trigger", { demo: {
      condition: "reactive", question: "Remote work is better", prior_lean: 0.4, prior_reasons: "focus",
      nodes: cardsBody.demo.nodes, events: [{ event_type: "commit_intent", node_id: null, payload: { lean: 0.5 }, elapsed_ms: 1 }],
    } }, c2);
    check((trig.json as { triggered: boolean; prompt: string }).triggered && (trig.json as { prompt: string }).prompt === DEMO_CANNED_PROMPT, "over budget → fixed canned prompt");
    const anth = lm.log.filter(r => r.table === "anthropic").length;
    check(anth === 5, `Anthropic called exactly 5 times (got ${anth})`);
    check(lm.log.filter(r => r.step === "demo-llm" && RESEARCH_TABLES.includes(r.table)).length === 0, "LLM demo made 0 research-table requests");
    stopApp(lapp); apps.pop();
    await lm.stop();
  } finally {
    for (const a of apps) stopApp(a);
  }

  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
