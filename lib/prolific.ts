// Prolific integration helpers (client-safe: no server imports).
//
// Prolific IDs identify a participant's Prolific account. They are stored on the
// participants row and in sessionStorage only. Never log them, never put them in a URL
// we build, and never pass them to the Anthropic API or into any prompt.

const KEYS = {
  pid:       "kairos_prolific_pid",
  studyId:   "kairos_prolific_study_id",
  sessionId: "kairos_prolific_session_id",
} as const;

export interface ProlificIds {
  pid:       string;
  studyId:   string;
  sessionId: string;
}

export const ALREADY_PARTICIPATED_MSG = "This Prolific account has already taken part in this study.";

/** IDs starting with "test" bypass the one-participation-per-account rule (matches the DB index). */
export function isTestPid(pid: string): boolean {
  return pid.startsWith("test");
}

/**
 * Copy PROLIFIC_PID / STUDY_ID / SESSION_ID from the current URL into sessionStorage.
 * Only overwrites when the URL carries a PROLIFIC_PID, so later pages without the query
 * string keep the values captured on the entry page.
 */
export function captureProlificParams(): void {
  try {
    const q   = new URLSearchParams(window.location.search);
    const pid = q.get("PROLIFIC_PID")?.trim();
    if (!pid) return;
    sessionStorage.setItem(KEYS.pid,       pid);
    sessionStorage.setItem(KEYS.studyId,   q.get("STUDY_ID")?.trim()   ?? "");
    sessionStorage.setItem(KEYS.sessionId, q.get("SESSION_ID")?.trim() ?? "");
  } catch {
    // sessionStorage unavailable — onboarding will show the "open from Prolific" screen.
  }
}

/** Stored Prolific IDs, or null when no PROLIFIC_PID has been captured. */
export function getProlificIds(): ProlificIds | null {
  try {
    const pid = sessionStorage.getItem(KEYS.pid) ?? "";
    if (!pid) return null;
    return {
      pid,
      studyId:   sessionStorage.getItem(KEYS.studyId)   ?? "",
      sessionId: sessionStorage.getItem(KEYS.sessionId) ?? "",
    };
  } catch {
    return null;
  }
}

/** Prolific completion URL, or null when NEXT_PUBLIC_PROLIFIC_COMPLETION_CODE is unset. */
export function prolificCompletionUrl(): string | null {
  const code = process.env.NEXT_PUBLIC_PROLIFIC_COMPLETION_CODE;
  if (!code) return null;
  return `https://app.prolific.com/submissions/complete?cc=${encodeURIComponent(code)}`;
}
