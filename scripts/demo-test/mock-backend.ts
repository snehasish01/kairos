// Minimal in-memory stand-ins for Supabase PostgREST and the Anthropic Messages API, so
// the real Next.js routes can be exercised end-to-end with no network and no real data.
// Every request is recorded so tests can assert exactly which tables were touched.

import http from "node:http";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";

export interface RecordedRequest {
  step:   string;
  method: string;
  table:  string;            // PostgREST table, or "anthropic"
  query:  string;
  body:   unknown;
}

type Row = Record<string, unknown>;

const DEFAULTS: Record<string, () => Row> = {
  sessions: () => ({ status: "active", started_at: new Date().toISOString(), current_lean: null, completed_at: null }),
};

export class MockBackend {
  tables = new Map<string, Row[]>();
  log: RecordedRequest[] = [];
  step = "setup";
  anthropicFails = false;
  private server = http.createServer((req, res) => this.handle(req, res));

  async start(): Promise<string> {
    await new Promise<void>(r => this.server.listen(0, "127.0.0.1", () => r()));
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }
  stop(): Promise<void> {
    return new Promise(r => this.server.close(() => r()));
  }

  seed(table: string, rows: Row[]) {
    this.tables.set(table, rows.map(r => ({ id: randomUUID(), created_at: new Date().toISOString(), ...r })));
  }
  rows(table: string): Row[] {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return this.tables.get(table)!;
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse) {
    let raw = "";
    req.on("data", c => { raw += c; });
    req.on("end", () => {
      const url  = new URL(req.url ?? "/", "http://mock");
      const body = raw ? JSON.parse(raw) : null;
      if (url.pathname === "/v1/messages") return this.anthropic(body, res);
      const m = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/);
      if (!m) { res.writeHead(404).end(); return; }
      this.log.push({ step: this.step, method: req.method ?? "", table: m[1], query: url.search, body });
      this.postgrest(req, url, m[1], body, res);
    });
  }

  private anthropic(body: { system?: string } | null, res: http.ServerResponse) {
    this.log.push({ step: this.step, method: "POST", table: "anthropic", query: "", body: null });
    if (this.anthropicFails) {
      res.writeHead(500, { "content-type": "application/json" })
        .end(JSON.stringify({ type: "error", error: { type: "api_error", message: "mock failure" } }));
      return;
    }
    const isCards = (body?.system ?? "").includes("reasoning cards");
    const text = isCards
      ? JSON.stringify([
          { edge_type: "observe_world", valence: "supports",   headline: "Mock supporting card", content: "Mock supporting evidence." },
          { edge_type: "observe_self",  valence: "undermines", headline: "Mock undermining card", content: "Mock undermining evidence." },
          { edge_type: "predict_future", valence: "neutral",   headline: "Mock neutral card",    content: "Mock neutral consideration." },
        ])
      : "Mock live reflection question?";
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
      id: "msg_mock", type: "message", role: "assistant", model: "mock",
      content: [{ type: "text", text }], stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    }));
  }

  private postgrest(req: http.IncomingMessage, url: URL, table: string, body: unknown, res: http.ServerResponse) {
    const prefer   = String(req.headers["prefer"] ?? "");
    const wantsObj = String(req.headers["accept"] ?? "").includes("vnd.pgrst.object");
    const filters: [string, string][] = [];
    let limit: number | null = null;
    for (const [k, v] of url.searchParams) {
      if (k === "limit") limit = Number(v);
      else if (v.startsWith("eq.")) filters.push([k, v.slice(3)]);
    }
    const match = (r: Row) => filters.every(([k, v]) => String(r[k]) === v);
    const all   = this.rows(table);

    const send = (rows: Row[], status = 200) => {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (prefer.includes("count=exact")) headers["content-range"] = `*/${rows.length}`;
      if (req.method === "HEAD") { res.writeHead(status, headers).end(); return; }
      if (wantsObj) {
        if (rows.length !== 1) {
          res.writeHead(406, headers).end(JSON.stringify({
            code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned",
            details: `The result contains ${rows.length} rows`, hint: null,
          }));
          return;
        }
        res.writeHead(status, headers).end(JSON.stringify(rows[0]));
        return;
      }
      res.writeHead(status, headers).end(JSON.stringify(rows));
    };

    switch (req.method) {
      case "GET":
      case "HEAD": {
        let rows = all.filter(match);
        if (limit !== null) rows = rows.slice(0, limit);
        return send(rows);
      }
      case "POST": {
        const items = (Array.isArray(body) ? body : [body]) as Row[];
        const onConflict = url.searchParams.get("on_conflict");
        const upsert = prefer.includes("resolution=merge-duplicates");
        const out: Row[] = [];
        for (const item of items) {
          const existing = upsert && onConflict ? all.find(r => r[onConflict] === item[onConflict]) : undefined;
          if (existing) { Object.assign(existing, item); out.push(existing); continue; }
          if (table === "participants" && typeof item.prolific_pid === "string" && !item.prolific_pid.startsWith("test")
              && all.some(r => r.prolific_pid === item.prolific_pid)) {
            res.writeHead(409, { "content-type": "application/json" })
              .end(JSON.stringify({ code: "23505", message: "duplicate key", details: null, hint: null }));
            return;
          }
          const row = { id: randomUUID(), created_at: new Date().toISOString(), ...(DEFAULTS[table]?.() ?? {}), ...item };
          all.push(row);
          out.push(row);
        }
        if (!prefer.includes("return=representation")) { res.writeHead(201).end(); return; }
        return send(out, 201);
      }
      case "PATCH": {
        const rows = all.filter(match);
        for (const r of rows) Object.assign(r, body as Row);
        if (!prefer.includes("return=representation")) { res.writeHead(204).end(); return; }
        return send(rows);
      }
      case "DELETE": {
        const keep = all.filter(r => !match(r));
        this.tables.set(table, keep);
        res.writeHead(204).end();
        return;
      }
      default:
        res.writeHead(405).end();
    }
  }
}
