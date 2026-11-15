// Pure computation of the debrief "portrait" from a session's rows.
// Used by /api/debrief (research path) and by the in-browser demo store, so both show
// exactly the same summary. Moved verbatim from app/api/debrief/route.ts.

import type { EventRow } from "./signal-processor";
import { EDGE_TYPES }    from "./ui-constants";

export interface DebriefInput {
  session:         { prior_lean: number | null; started_at: string };
  rawEvents:       unknown[] | null;
  rawNodes:        unknown[] | null;
  rawSamples:      unknown[] | null;
  promptEventData: unknown | null;
  outcomeData:     unknown | null;
}

export interface DebriefSummary {
  initialLean:      number;
  finalLean:        number;
  confirmationSkew: { supportingEngaged: number; underminingEngaged: number; neutralEngaged: number };
  operationDist:    Record<string, number>;
  rung2and4Covered: boolean;
  leanTrajectory:   { lean: number; elapsed_s: number }[];
  promptFired:      boolean;
  promptText:       string | null;
  promptResponse:   string | null;
  promptElapsed_s:  number | null;
}

export function computeDebrief({
  session, rawEvents, rawNodes, rawSamples, promptEventData, outcomeData,
}: DebriefInput): DebriefSummary {
  const events  = (rawEvents  ?? []) as EventRow[];
  const nodes   = (rawNodes   ?? []) as { id: string; edge_type: string | null; valence: string }[];
  const samples = (rawSamples ?? []) as { lean_value: number; created_at: string }[];
  const promptEv = promptEventData as {
    fired_at: string; prompt_text: string | null; response_text: string | null;
  } | null;
  const outcome = outcomeData as { final_lean: number | null } | null;

  // ── Confirmation skew ────────────────────────────────────────────────────
  const valenceById = new Map(nodes.map(n => [n.id, n.valence]));
  let supportingEngaged = 0;
  let underminingEngaged = 0;
  let neutralEngaged = 0;

  for (const e of events) {
    if ((e.event_type === "endorse" || e.event_type === "endorse_weighted") && e.node_id) {
      const v = valenceById.get(e.node_id) ?? "neutral";
      if (v === "supports")   supportingEngaged++;
      if (v === "undermines") underminingEngaged++;
      if (v === "neutral")    neutralEngaged++;
    }
    if (e.event_type === "dismiss" && e.hidden_valence) {
      if (e.hidden_valence === "supports")   supportingEngaged++;
      if (e.hidden_valence === "undermines") underminingEngaged++;
      if (e.hidden_valence === "neutral")    neutralEngaged++;
    }
  }

  // ── Operation distribution ───────────────────────────────────────────────
  const operationDist: Record<string, number> = {};
  for (const t of EDGE_TYPES) operationDist[t] = 0;
  for (const n of nodes) {
    if (n.edge_type && n.edge_type in operationDist) {
      operationDist[n.edge_type]++;
    }
  }
  const rung2and4Covered =
    operationDist.observe_self > 0 && operationDist.reflect_on_prediction > 0;

  // ── Lean trajectory ──────────────────────────────────────────────────────
  const sessionStart = new Date(session.started_at).getTime();
  const initialLean  = session.prior_lean ?? 0;

  const leanTrajectory: { lean: number; elapsed_s: number }[] = [
    { lean: initialLean, elapsed_s: 0 },
    ...samples.map(s => ({
      lean:      s.lean_value,
      elapsed_s: Math.round((new Date(s.created_at).getTime() - sessionStart) / 1000),
    })),
  ];

  // Final lean: last lean_sample, else session_outcome, else prior_lean.
  const finalLean =
    samples.length > 0
      ? samples[samples.length - 1].lean_value
      : (outcome?.final_lean ?? initialLean);

  // ── Prompt moment ────────────────────────────────────────────────────────
  let promptFired       = false;
  let promptText: string | null = null;
  let promptResponse: string | null = null;
  let promptElapsed_s: number | null = null;

  if (promptEv) {
    promptFired     = true;
    promptText      = promptEv.prompt_text;
    promptResponse  = promptEv.response_text?.trim() || null;
    promptElapsed_s = Math.round(
      (new Date(promptEv.fired_at).getTime() - sessionStart) / 1000,
    );
  }

  return {
    initialLean,
    finalLean,
    confirmationSkew:  { supportingEngaged, underminingEngaged, neutralEngaged },
    operationDist,
    rung2and4Covered,
    leanTrajectory,
    promptFired,
    promptText,
    promptResponse,
    promptElapsed_s,
  };
}
