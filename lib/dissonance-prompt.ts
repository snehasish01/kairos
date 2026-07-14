import Anthropic                               from "@anthropic-ai/sdk";
import type { GraphNode }                        from "./conviction-graph";
import type { Signals, EventRow }               from "./signal-processor";
import type { DbNode }                          from "./conviction-graph";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL  = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

interface SessionContext {
  question:      string;
  prior_lean:    number | null;
  prior_reasons: string | null;
}


/**
 * Generate one short self-referential dissonance question.
 *
 * Design principle: anchor entirely to the participant's own words (prior_reasons)
 * and one specific piece of avoided content. Brevity and specificity are the
 * quality levers — not comprehensiveness. Temperature 0.7, hard 20-word cap.
 */
export async function generateDissonancePrompt(
  session: SessionContext,
  root:    GraphNode,
  signals: Signals,
  events:  EventRow[],
  nodes:   DbNode[],
): Promise<string> {
  // Suppressed lint: root and signals are available for future use but we
  // intentionally keep the context lean — graph summaries and signal numbers
  // make the output worse, not better.
  void root; void signals;

  // ── Identify the most specific avoidance signal ───────────────────────────
  // Priority 1: undermining nodes endorsed into the graph but never followed up.
  const engagedIds = new Set(events.filter(e => e.node_id).map(e => e.node_id!));
  const avoidedEndorsedCounter = nodes.find(
    n => n.valence === "undermines" && engagedIds.has(n.id) &&
         !events.some(e => e.node_id === n.id && e.event_type !== "endorse"),
  );

  // Priority 2: undermining nodes never touched at all.
  const avoidedNodes = nodes.filter(
    n => n.valence === "undermines" && !engagedIds.has(n.id),
  );

  // Priority 3: dismissed counter-cards (have content only in hidden_ fields).
  const dismissedCounterEvents = events.filter(
    e => e.event_type === "dismiss" && e.hidden_valence === "undermines",
  );

  // Pick the best single avoided content to surface.
  const avoidedContent: string | null =
    avoidedEndorsedCounter?.content ??
    avoidedNodes[0]?.content ??
    null;

  // ── Build minimal context ─────────────────────────────────────────────────
  const priorLine = session.prior_reasons
    ? `When they started, they said: "${session.prior_reasons.trim()}"`
    : `They started with no stated reason.`;

  const avoidanceLine = avoidedContent
    ? `The one argument they never engaged with: "${avoidedContent}"`
    : dismissedCounterEvents.length > 0
      ? `They dismissed ${dismissedCounterEvents.length} challenging argument(s) without engaging.`
      : `They engaged broadly but leaned heavily toward confirming evidence.`;

  const userContent =
`Topic the person is exploring: "${session.question}"

${priorLine}

${avoidanceLine}

Write one question — maximum 20 words — that uses their own words or reasoning and points \
at the gap between what they said and what they avoided. Specific and short. \
Do not moralize. Do not explain the question.`;

  const response = await client.messages.create({
    model:      MODEL,
    max_tokens: 80,   // generous for 20 words; hard ceiling keeps output tight
    temperature: 0.7,
    system:
      "You write single reflection questions for a belief-exploration study. " +
      "Rules: one question only, maximum 20 words, no compound questions, no preamble. " +
      "Ground the question in the person's own stated words and the specific gap shown. " +
      "Return the bare question text — no quotes, no explanation.",
    messages: [{ role: "user", content: userContent }],
  });

  const text = response.content
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("")
    .trim();

  return text.replace(/^["']|["']$/g, "");
}
