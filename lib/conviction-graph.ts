// Shared types used across lib, API routes, and UI.

export type EdgeType =
  | "observe_world"
  | "observe_self"
  | "predict_future"
  | "reflect_on_prediction";

export type Valence    = "supports" | "undermines" | "neutral";
export type AuthoredBy = "system" | "user";

export interface DbNode {
  id:          string;
  session_id:  string;
  parent_id:   string | null;
  edge_type:   EdgeType | null;
  valence:     Valence;
  content:     string;
  authored_by: AuthoredBy;
  depth:       number;
  created_at:  string;
}

export interface GraphNode extends DbNode {
  children: GraphNode[];
}

// ─── Build ────────────────────────────────────────────────────────────────────

/** Convert a flat node list (from Supabase) into a rooted tree. */
export function buildGraph(nodes: DbNode[]): GraphNode | null {
  if (nodes.length === 0) return null;

  const map = new Map<string, GraphNode>();
  for (const n of nodes) map.set(n.id, { ...n, children: [] });

  let root: GraphNode | null = null;
  for (const node of map.values()) {
    if (node.parent_id === null) {
      root = node;
    } else {
      const parent = map.get(node.parent_id);
      if (parent) parent.children.push(node);
    }
  }
  return root;
}

// ─── Traversal ────────────────────────────────────────────────────────────────

/** DFS pre-order traversal. Visitor receives (node, depthFromRoot). */
export function traverseGraph(
  root: GraphNode,
  visitor: (node: GraphNode, depth: number) => void,
  _depth = 0,
): void {
  visitor(root, _depth);
  for (const child of root.children) traverseGraph(child, visitor, _depth + 1);
}

// ─── Summary (for LLM card-generator context) ─────────────────────────────────

const EDGE_LABEL: Record<string, string> = {
  observe_world:          "observe_world",
  observe_self:           "observe_self",
  predict_future:         "predict_future",
  reflect_on_prediction:  "reflect_on_prediction",
};

function leanDescription(lean: number | null): string {
  if (lean === null || lean === undefined) return "unknown";
  if (lean <= -0.6) return `${lean.toFixed(2)} (strongly disagrees)`;
  if (lean <= -0.2) return `${lean.toFixed(2)} (leans against)`;
  if (lean <   0.2) return `${lean.toFixed(2)} (genuinely uncertain)`;
  if (lean <   0.6) return `${lean.toFixed(2)} (leans toward)`;
  return `${lean.toFixed(2)} (strongly agrees)`;
}

/**
 * Produce a compact, structured text summary of the conviction graph.
 * Passed verbatim to Claude as context for card generation and dissonance prompts.
 */
export function summarizeGraph(
  root: GraphNode,
  priorLean?: number | null,
): string {
  const lines: string[] = [];

  // Header
  lines.push(`CONVICTION: "${root.content}"`);
  if (priorLean !== undefined && priorLean !== null) {
    lines.push(`PRIOR LEAN: ${leanDescription(priorLean)}`);
  }
  lines.push("");
  lines.push("GRAPH:");

  // Tree rendering (skip root itself, render children with indentation)
  function renderNode(node: GraphNode, indent: string, isLast: boolean) {
    const prefix = indent + (isLast ? "└─ " : "├─ ");
    const tag =
      node.edge_type
        ? `[${EDGE_LABEL[node.edge_type]} | ${node.valence}]`
        : "[root]";
    lines.push(`${prefix}${tag} "${node.content}"`);
    const childIndent = indent + (isLast ? "   " : "│  ");
    node.children.forEach((c, i) =>
      renderNode(c, childIndent, i === node.children.length - 1),
    );
  }

  lines.push(`[root] "${root.content}"`);
  root.children.forEach((c, i) =>
    renderNode(c, "", i === root.children.length - 1),
  );

  // Aggregate counts
  const opCounts: Record<string, number> = {
    observe_world: 0, observe_self: 0, predict_future: 0, reflect_on_prediction: 0,
  };
  const valCounts: Record<string, number> = { supports: 0, undermines: 0, neutral: 0 };
  let totalNonRoot = 0;

  traverseGraph(root, (n) => {
    if (n.edge_type) {
      opCounts[n.edge_type]   = (opCounts[n.edge_type]   ?? 0) + 1;
      valCounts[n.valence]    = (valCounts[n.valence]     ?? 0) + 1;
      totalNonRoot++;
    }
  });

  lines.push("");
  lines.push(
    `OPERATION COUNTS (${totalNonRoot} non-root nodes): ` +
    Object.entries(opCounts).map(([k, v]) => `${k}=${v}`).join(", "),
  );
  lines.push(
    `VALENCE COUNTS: ` +
    Object.entries(valCounts).map(([k, v]) => `${k}=${v}`).join(", "),
  );
  lines.push(
    `RUNG_2_AND_4_PRESENT: ${opCounts.observe_self > 0 && opCounts.reflect_on_prediction > 0}`,
  );

  return lines.join("\n");
}
