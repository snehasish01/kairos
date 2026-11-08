/**
 * Canonical TypeScript types for every KAIROS database table.
 * Import from here in API routes and server-side lib.
 * Do NOT import in client components — these types mirror server-only rows.
 *
 * Domain types (EdgeType, Valence, etc.) are also exported from
 * lib/conviction-graph.ts for use in UI code; the definitions below are the
 * single source of truth and should stay in sync.
 */

// ── Domain enums ──────────────────────────────────────────────────────────────

export type EdgeType =
  | "observe_world"
  | "observe_self"
  | "predict_future"
  | "reflect_on_prediction";

export type Valence     = "supports" | "undermines" | "neutral";
export type AuthoredBy  = "system"   | "user";
export type Condition   = "anticipatory" | "reactive" | "random" | "silent";
export type TriggerType = "anticipatory" | "reactive" | "random";
export type ResponseCode = "engaged" | "deflected" | "ignored";
export type SessionStatus = "active" | "triggered" | "complete" | "abandoned";

export type EventType =
  | "open"
  | "expand"
  | "dwell_start"
  | "dwell_end"
  | "endorse"
  | "endorse_weighted"
  | "dismiss"
  | "add_own"
  | "revisit"
  | "lean_shift"
  | "commit_intent";

// ── Existing tables ───────────────────────────────────────────────────────────

export interface DbParticipant {
  id:            string;
  condition:     Condition;
  age_range:     string | null;
  education:     string | null;
  passed_checks: boolean;
  created_at:    string;
}

export interface DbSession {
  id:               string;
  participant_id:   string;
  question:         string;
  prior_lean:       number | null;  // [-1, 1]
  prior_reasons:    string | null;
  current_lean:     number | null;
  status:           SessionStatus;
  trigger_fired_at: string | null;
  started_at:       string;
  completed_at:     string | null;
}

export interface DbNode {
  id:          string;
  session_id:  string;
  parent_id:   string | null;
  edge_type:   EdgeType | null;   // null only for the root node
  valence:     Valence;
  content:     string;
  authored_by: AuthoredBy;
  depth:       number;
  created_at:  string;
}

/** Full events row including Phase 2 hidden-metadata columns. */
export interface DbEvent {
  id:               string;
  session_id:       string;
  node_id:          string | null;
  event_type:       EventType;
  payload:          Record<string, unknown> | null;
  elapsed_ms:       number | null;
  // Populated for endorse / endorse_weighted / dismiss only; null otherwise.
  hidden_valence:   Valence   | null;
  hidden_edge_type: EdgeType  | null;
  created_at:       string;
}

/** Legacy trigger log — kept for backward compatibility; new writes go to prompt_events. */
export interface DbTrigger {
  id:                   string;
  session_id:           string;
  condition:            Condition;
  signal_scores:        Record<string, unknown> | null;
  prompt_generated:     string | null;
  participant_response: string | null;
  elapsed_ms:           number | null;
  created_at:           string;
}

/** Participant's post-session self-report (Likert items). */
export interface DbOutcome {
  id:               string;
  session_id:       string;
  final_lean:       number | null;
  lean_delta:       number | null;
  breadth_engaged:  number | null;
  self_consistency: number | null;
  felt_genuine:     number | null;
  created_at:       string;
}

// ── New tables (Phase 2) ──────────────────────────────────────────────────────

/** Contextual lean re-sample tied to a specific card interaction. */
export interface DbLeanSample {
  id:          string;
  session_id:  string;
  node_id:     string | null;  // card that prompted re-rating; null for commit-level
  lean_value:  number;         // [-1, 1]
  created_at:  string;
}

/**
 * Prompt event: the mediator capture.
 * At most one row per session (UNIQUE on session_id).
 * response_code is coded offline; store raw response_text now.
 */
export interface DbPromptEvent {
  id:            string;
  session_id:    string;
  condition:     Condition;
  trigger_type:  TriggerType;
  fired_at:      string;
  prompt_text:   string;
  response_text: string | null;
  word_count:    number | null;
  response_code: ResponseCode | null;  // coded post-hoc, offline
  created_at:    string;
}

/**
 * Final written rationale — the IC-scored dependent variable.
 * Exactly one row per completed session (UNIQUE on session_id).
 * IC scoring happens offline; the app only stores and retrieves the text.
 */
export interface DbFinalRationale {
  id:           string;
  session_id:   string;
  text:         string;
  word_count:   number | null;
  committed_at: string;
}

/**
 * Session-level computed outcome signals — stored for analysis, never enforced.
 * equilibrium_reached is diagnostic only; it does NOT gate the exit path.
 */
export interface DbSessionOutcome {
  id:                   string;
  session_id:           string;
  equilibrium_reached:  boolean | null;
  hardened_prematurely: boolean | null;
  bailed:               boolean;
  initial_lean:         number | null;
  final_lean:           number | null;
  created_at:           string;
}

/**
 * Email opt-in list.
 * ISOLATED: no session_id, no foreign key, no link to any response or participant data.
 * Merging with session data would break the consent anonymity promise.
 */
export interface DbMailingListEntry {
  id:         string;
  email:      string;
  created_at: string;
}
