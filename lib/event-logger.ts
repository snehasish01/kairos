export type EventType =
  | "open" | "expand" | "dwell_start" | "dwell_end"
  | "endorse" | "dismiss" | "add_own" | "revisit"
  | "lean_shift" | "commit_intent";

export type EventLogger = (
  type:     EventType,
  nodeId:   string | null,
  payload?: Record<string, unknown>,
) => void;

/**
 * Returns a fire-and-forget event logger bound to a session and a wall-clock
 * start time. Errors are swallowed so a logging failure never breaks the UI.
 */
export function makeEventLogger(sessionId: string, startedAt: number): EventLogger {
  return function logEvent(type, nodeId, payload) {
    fetch("/api/events", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        node_id:    nodeId ?? null,
        event_type: type,
        payload:    payload ?? null,
        elapsed_ms: Math.round(Date.now() - startedAt),
      }),
    }).catch(() => { /* intentionally silent */ });
  };
}
