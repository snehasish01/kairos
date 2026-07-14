import { CONFIG } from "./config";
import type { Signals, EventRow } from "./signal-processor";

export type Condition = "anticipatory" | "reactive" | "random" | "silent";

/**
 * Pure, synchronous trigger decision. No side effects; all I/O happens in the
 * API route that calls this.
 *
 * @param condition        The participant's experimental condition.
 * @param signals          Output of computeSignals for the current session.
 * @param events           Full event log (chronological) for the session.
 * @param alreadyTriggered True when a trigger row already exists for the session.
 */
export function shouldTrigger(
  condition:        Condition,
  signals:          Signals,
  events:           EventRow[],
  alreadyTriggered: boolean,
): boolean {
  if (alreadyTriggered) return false;

  switch (condition) {
    case "anticipatory":
      // Fire during belief formation: window is open when commitment is forming
      // (not yet locked), attention is lopsided, and counter-evidence is avoided.
      return signals.inAnticipatoryWindow;

    case "reactive":
      // Fire only after the participant explicitly signals intent to commit.
      return events.some(e => e.event_type === "commit_intent");

    case "random": {
      // Fire with fixed probability once a minimum number of events have accrued.
      // Prevents spurious early-session triggers.
      if (events.length < CONFIG.random.minEvents) return false;
      return Math.random() < CONFIG.random.fireProb;
    }

    case "silent":
      // Control condition — never intervenes.
      return false;

    default:
      return false;
  }
}
