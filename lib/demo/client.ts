// Browser-only helpers for entering / leaving demo mode.
//
// The server-side switch is the httpOnly demo cookie (set by POST /api/demo). The
// sessionStorage flag below only tells the browser to route API calls to the local demo
// store; it cannot unlock anything on the server.

import { DEMO_CHANGE_EVENT, DEMO_CONDITIONS, DEMO_FLAG_KEY, DEMO_STORE_KEY, type DemoCondition } from "./shared";
import { newDemoState, saveDemoState } from "./local-api";

// Study keys the participant pages keep in sessionStorage; cleared on demo entry/exit so a
// demo can never resume a research session (or vice versa).
const STUDY_KEYS = [
  "kairos_pid", "kairos_condition", "kairos_question", "kairos_topic_id", "kairos_lean",
  "kairos_prior_lean", "kairos_reasons", "kairos_sid", "kairos_root_nid", "kairos_session_pid",
  "kairos_current_lean", "kairos_rationale_saved_sid",
];

export function isDemoActive(): boolean {
  try {
    return sessionStorage.getItem(DEMO_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

/** Local random draw between the pilot arms. Never consults the research counter. */
export function randomDemoCondition(): DemoCondition {
  return DEMO_CONDITIONS[Math.floor(Math.random() * DEMO_CONDITIONS.length)];
}

export interface DemoStartResult { ok: boolean; llm: boolean; error?: string }

export async function enterDemo(condition: DemoCondition): Promise<DemoStartResult> {
  const res = await fetch("/api/demo", { method: "POST" }).catch(() => null);
  if (!res || !res.ok) {
    const body = await res?.json().catch(() => ({})) as { error?: string } | undefined;
    return { ok: false, llm: false, error: body?.error ?? "The demo is not available right now." };
  }
  const { llm } = await res.json() as { llm?: boolean };
  for (const k of STUDY_KEYS) sessionStorage.removeItem(k);
  saveDemoState(sessionStorage, newDemoState(condition));
  sessionStorage.setItem(DEMO_FLAG_KEY, "1");
  window.dispatchEvent(new Event(DEMO_CHANGE_EVENT));
  return { ok: true, llm: !!llm };
}

export async function exitDemo(): Promise<void> {
  try {
    const wasDemo = isDemoActive();
    sessionStorage.removeItem(DEMO_FLAG_KEY);
    sessionStorage.removeItem(DEMO_STORE_KEY);
    if (wasDemo) for (const k of STUDY_KEYS) sessionStorage.removeItem(k);
  } catch {
    // storage unavailable
  }
  window.dispatchEvent(new Event(DEMO_CHANGE_EVENT));
  await fetch("/api/demo", { method: "DELETE" }).catch(() => {});
}
