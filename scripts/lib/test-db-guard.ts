// Refuse to run a DB-writing script unless it is explicitly pointed at a test database.
//
// These scripts use the service-role key, so they can write to any table. They must never
// run against the project holding the frozen pilot dataset. Requirements:
//   1. TEST_DATABASE=true is set explicitly, and
//   2. NEXT_PUBLIC_SUPABASE_URL is set and is not a protected (live) project.
// Protected projects are stored as SHA-256 hashes of their project ref so the ref itself
// is not published. Local Supabase (localhost / 127.0.0.1) is always allowed.

import { createHash } from "node:crypto";

const PROTECTED_PROJECT_REF_SHA256 = new Set<string>([
  "8472800109a0c80807058f29baea90bb7f898a57d922468885c03358ddf80102", // KAIROS pilot (frozen dataset)
]);

function refuse(script: string, reason: string): never {
  console.error(`\n✗ ${script} refused to run: ${reason}\n` +
    `  Set TEST_DATABASE=true and point NEXT_PUBLIC_SUPABASE_URL at a test project (not the live pilot).\n`);
  process.exit(1);
}

export function assertTestDatabase(script: string): void {
  if (process.env.TEST_DATABASE !== "true") {
    refuse(script, "TEST_DATABASE is not set to \"true\".");
  }
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let host: string;
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    refuse(script, "NEXT_PUBLIC_SUPABASE_URL is missing or not a URL.");
  }
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return;
  const ref = host.split(".")[0];
  const digest = createHash("sha256").update(ref).digest("hex");
  if (PROTECTED_PROJECT_REF_SHA256.has(digest)) {
    refuse(script, "NEXT_PUBLIC_SUPABASE_URL points at the live pilot project.");
  }
}
