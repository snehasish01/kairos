// Server-only: signed demo token (HMAC-SHA256) carried in an httpOnly cookie.
//
// The token proves the demo session was issued by this server (so the per-session LLM cap
// cannot be dodged by inventing session IDs). It carries no participant data.
// DEMO_TOKEN_SECRET is read here and nowhere else; it is never logged or sent to the browser.

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE, DEMO_ID_PREFIX } from "./shared";

export interface DemoClaims {
  /** Demo session id (random, prefixed, never a UUID that could match a research row). */
  sid: string;
  /** Expiry, epoch seconds. */
  exp: number;
  /** LLM calls already spent by this demo session. */
  n:   number;
}

export const DEMO_TTL_SECONDS = 4 * 60 * 60;

function secret(): string | null {
  const s = process.env.DEMO_TOKEN_SECRET;
  return s && s.length >= 16 ? s : null;
}

/** Demo mode is available only when a signing secret is configured. */
export function demoConfigured(): boolean {
  return secret() !== null;
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

function mac(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function newDemoClaims(): DemoClaims {
  return {
    sid: `${DEMO_ID_PREFIX}${randomUUID()}`,
    exp: Math.floor(Date.now() / 1000) + DEMO_TTL_SECONDS,
    n:   0,
  };
}

export function signDemo(claims: DemoClaims): string {
  const key = secret();
  if (!key) throw new Error("demo not configured");
  const payload = b64url(JSON.stringify(claims));
  return `${payload}.${mac(payload, key)}`;
}

export function verifyDemo(token: string | undefined): DemoClaims | null {
  const key = secret();
  if (!key || !token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(mac(payload, key));
  const given    = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const c = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as DemoClaims;
    if (typeof c.sid !== "string" || !c.sid.startsWith(DEMO_ID_PREFIX)) return null;
    if (typeof c.exp !== "number" || c.exp < Date.now() / 1000) return null;
    if (typeof c.n !== "number" || c.n < 0) return null;
    return c;
  } catch {
    return null;
  }
}

/** True when the request carries a demo cookie at all (valid or not). */
export function hasDemoCookie(req: NextRequest): boolean {
  return req.cookies.has(DEMO_COOKIE);
}

/** Verified claims from the request's demo cookie, or null. */
export function readDemo(req: NextRequest): DemoClaims | null {
  return verifyDemo(req.cookies.get(DEMO_COOKIE)?.value);
}

export function setDemoCookie(res: NextResponse, claims: DemoClaims): void {
  res.cookies.set(DEMO_COOKIE, signDemo(claims), {
    httpOnly: true,
    sameSite: "lax",
    secure:   process.env.NODE_ENV === "production",
    path:     "/",
    maxAge:   Math.max(0, claims.exp - Math.floor(Date.now() / 1000)),
  });
}

export function clearDemoCookie(res: NextResponse): void {
  res.cookies.set(DEMO_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}

/** 403 returned by every research route when a demo cookie is present. */
export function demoForbidden(): NextResponse {
  return NextResponse.json(
    { error: "Research routes are disabled in demo mode; no data is saved.", code: "demo_mode" },
    { status: 403 },
  );
}

/**
 * Guard for research routes (defense in depth behind proxy.ts): a request carrying a
 * demo cookie must never read or write research tables.
 */
export function rejectIfDemo(req: NextRequest): NextResponse | null {
  return hasDemoCookie(req) ? demoForbidden() : null;
}
