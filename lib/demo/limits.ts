// Server-only: in-memory rate limits for demo mode.
//
// These are per server instance. On serverless hosting a determined caller can spread
// requests across instances, so treat them as a first line of defence and ALSO set a spend
// limit on the Anthropic key used in production. Live LLM calls in the demo are off unless
// DEMO_LLM_ENABLED=true; otherwise the demo serves canned content and spends nothing.

import type { NextRequest } from "next/server";

function intEnv(name: string, fallback: number): number {
  const v = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

export const LIMITS = {
  get perSession()     { return intEnv("DEMO_MAX_LLM_CALLS_PER_SESSION", 15); },
  get perIpPerHour()   { return intEnv("DEMO_MAX_LLM_CALLS_PER_IP_PER_HOUR", 30); },
  get perDay()         { return intEnv("DEMO_MAX_LLM_CALLS_PER_DAY", 300); },
  startsPerIpPerHour:  20,
};

export function liveLlmEnabled(): boolean {
  return process.env.DEMO_LLM_ENABLED === "true" && !!process.env.ANTHROPIC_API_KEY;
}

const HOUR = 60 * 60 * 1000;
const MAX_TRACKED_KEYS = 10_000;

class SlidingWindow {
  private hits = new Map<string, number[]>();
  constructor(private windowMs: number) {}

  /** Records a hit and returns true if `key` is still under `limit` within the window. */
  take(key: string, limit: number, now = Date.now()): boolean {
    if (this.hits.size > MAX_TRACKED_KEYS) this.prune(now);
    const recent = (this.hits.get(key) ?? []).filter(t => now - t < this.windowMs);
    if (recent.length >= limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  private prune(now: number) {
    for (const [k, ts] of this.hits) {
      if (!ts.some(t => now - t < this.windowMs)) this.hits.delete(k);
    }
    // Still too many keys (flood of distinct IPs): fail closed by clearing old state.
    if (this.hits.size > MAX_TRACKED_KEYS) this.hits.clear();
  }
}

const startWindow = new SlidingWindow(HOUR);
const llmIpWindow = new SlidingWindow(HOUR);
const sessionSpend = new Map<string, number>();
let day = "";
let dayCount = 0;

export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Rate-limit issuing new demo sessions per IP. */
export function takeStartBudget(ip: string): boolean {
  return startWindow.take(ip, LIMITS.startsPerIpPerHour);
}

export type LlmBudget =
  | { ok: true;  n: number }
  | { ok: false; n: number; reason: "disabled" | "session_cap" | "ip_limit" | "daily_cap" };

/**
 * Try to spend one live LLM call for a demo session. `cookieN` is the spend recorded in the
 * signed cookie; the in-memory map covers replay of an older cookie on this instance.
 */
export function takeLlmBudget(ip: string, sid: string, cookieN: number): LlmBudget {
  const spent = Math.max(cookieN, sessionSpend.get(sid) ?? 0);
  if (!liveLlmEnabled())             return { ok: false, n: spent, reason: "disabled" };
  if (spent >= LIMITS.perSession)    return { ok: false, n: spent, reason: "session_cap" };

  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) { day = today; dayCount = 0; }
  if (dayCount >= LIMITS.perDay)     return { ok: false, n: spent, reason: "daily_cap" };

  if (!llmIpWindow.take(ip, LIMITS.perIpPerHour)) {
    return { ok: false, n: spent, reason: "ip_limit" };
  }

  dayCount++;
  if (sessionSpend.size > MAX_TRACKED_KEYS) sessionSpend.clear();
  sessionSpend.set(sid, spent + 1);
  return { ok: true, n: spent + 1 };
}
