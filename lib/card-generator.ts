import Anthropic from "@anthropic-ai/sdk";
import { CONFIG } from "./config";
import { GraphNode, EdgeType, Valence, summarizeGraph } from "./conviction-graph";

export interface Card {
  edge_type: EdgeType;
  valence:   Valence;
  headline:  string;  // one sentence, ≤15 words — shown in collapsed card state
  content:   string;
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL  = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

const SYSTEM_PROMPT =
  "You generate reasoning cards for a structured belief-exploration tool. " +
  "Output only valid JSON — no prose, no markdown fences, no explanation.";

function buildUserPrompt(graphContext: string): string {
  return (
    `Someone is exploring a conviction. Here is their reasoning graph:\n\n` +
    `<graph>\n${graphContext}\n</graph>\n\n` +
    `Notice what is missing: operation types with count 0 or very low, stances not yet ` +
    `considered, nodes that were never followed up.\n\n` +
    `Generate 3 cards following these STRICT requirements:\n` +
    `1. VALENCE BALANCE: The 3 cards must include exactly one "supports", one "undermines", ` +
    `and one "neutral" card — no exceptions. If the graph already has more undermines nodes ` +
    `than supports nodes, place the "supports" card first in the array.\n` +
    `2. RUNG PRIORITY: Prefer edge_types that have count 0 in the graph above. ` +
    `At least one card must use an edge_type that is absent or least-represented.\n` +
    `3. SPECIFICITY: Each card must be concrete and specific to this person's actual topic — ` +
    `not a generic template. Name real mechanisms, specific tradeoffs, or concrete scenarios ` +
    `that this person has not yet surfaced.\n\n` +
    `Return a JSON array of exactly 3 objects:\n` +
    `[{"edge_type": "...", "valence": "...", "headline": "...", "content": "..."}, ...]\n\n` +
    `edge_type: one of observe_world | observe_self | predict_future | reflect_on_prediction\n` +
    `valence: one of supports | undermines | neutral\n` +
    `headline: one sentence, ≤15 words — the core claim, written so the person can scan without expanding\n` +
    `content: the full argument (1–3 sentences, grounded in their specific situation)`
  );
}

function stripFences(text: string): string {
  return text.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();
}

export async function generateCards(
  root: GraphNode,
  priorLean?: number | null,
): Promise<Card[]> {
  const graphContext = summarizeGraph(root, priorLean ?? undefined);

  const response = await client.messages.create({
    model:      MODEL,
    max_tokens: CONFIG.llm.maxTokensCard,
    temperature: CONFIG.llm.temperature as number,
    system:     SYSTEM_PROMPT,
    messages:   [{ role: "user", content: buildUserPrompt(graphContext) }],
  });

  const raw  = response.content[0].type === "text" ? response.content[0].text : "";
  const json = stripFences(raw);
  return JSON.parse(json) as Card[];
}
