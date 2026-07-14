import { NextResponse } from "next/server";
import { buildGraph, DbNode } from "@/lib/conviction-graph";
import { generateCards } from "@/lib/card-generator";

// Hardcoded graph: biased toward supports, no observe_self, no reflect_on_prediction.
// Represents someone who thinks "Remote work is better for productivity" and has only
// gathered supporting evidence — the generator should surface the missing rungs + counter-stances.
const STUB_NODES: DbNode[] = [
  {
    id:          "root-1",
    session_id:  "test-session",
    parent_id:   null,
    edge_type:   null,
    valence:     "neutral",
    content:     "Remote work is better for individual productivity than office work",
    authored_by: "system",
    depth:       0,
    created_at:  "2024-01-01T00:00:00Z",
  },
  {
    id:          "node-2",
    session_id:  "test-session",
    parent_id:   "root-1",
    edge_type:   "observe_world",
    valence:     "supports",
    content:     "Stanford study found remote workers were 13% more productive than in-office peers",
    authored_by: "system",
    depth:       1,
    created_at:  "2024-01-01T00:00:01Z",
  },
  {
    id:          "node-3",
    session_id:  "test-session",
    parent_id:   "root-1",
    edge_type:   "observe_world",
    valence:     "supports",
    content:     "I personally finish tasks faster without office interruptions and impromptu meetings",
    authored_by: "user",
    depth:       1,
    created_at:  "2024-01-01T00:00:02Z",
  },
  {
    id:          "node-4",
    session_id:  "test-session",
    parent_id:   "root-1",
    edge_type:   "predict_future",
    valence:     "supports",
    content:     "If companies adopt hybrid models, top talent will choose employers with remote flexibility",
    authored_by: "system",
    depth:       1,
    created_at:  "2024-01-01T00:00:03Z",
  },
];

export async function GET() {
  const root = buildGraph(STUB_NODES);
  if (!root) {
    return NextResponse.json({ error: "Could not build test graph" }, { status: 500 });
  }

  try {
    const cards = await generateCards(root, 0.7);
    return NextResponse.json({ cards, graph_summary_for_debug: "remote work conviction — 3 support nodes, 0 undermines, 0 observe_self, 0 reflect_on_prediction" });
  } catch (err) {
    console.error("test card generation error:", err);
    return NextResponse.json({ error: "Card generation failed", detail: String(err) }, { status: 500 });
  }
}
