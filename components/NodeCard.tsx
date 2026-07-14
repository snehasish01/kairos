"use client";

import { useRef, useState } from "react";
import type { GraphNode, EdgeType, Valence } from "@/lib/conviction-graph";

/** Called when dwell starts or ends on a non-root graph node. */
export type DwellLogger = (
  nodeId:    string,
  edgeType:  EdgeType | null,
  valence:   Valence,
  isStart:   boolean,
) => void;

interface Props {
  node:      GraphNode;
  isRoot?:   boolean;
  logDwell?: DwellLogger;
}

const DWELL_DELAY_MS = 200;

export default function NodeCard({ node, isRoot = false, logDwell }: Props) {
  const [collapsed, setCollapsed] = useState(!isRoot);
  const timer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dwelling = useRef(false);

  function handleEnter() {
    if (!logDwell || isRoot) return;
    timer.current = setTimeout(() => {
      dwelling.current = true;
      logDwell(node.id, node.edge_type, node.valence, true);
    }, DWELL_DELAY_MS);
  }

  function handleLeave() {
    if (!logDwell || isRoot) return;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (dwelling.current) {
      dwelling.current = false;
      logDwell(node.id, node.edge_type, node.valence, false);
    }
  }

  const truncated = node.content.length > 100
    ? `${node.content.slice(0, 100)}…`
    : node.content;

  if (!isRoot && collapsed) {
    return (
      <div className="ml-5 border-l border-zinc-800 pl-4">
        <div
          className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 cursor-pointer hover:border-zinc-600 transition-colors"
          onClick={() => setCollapsed(false)}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
        >
          <div className="flex items-center justify-between">
            {node.authored_by === "user" && (
              <span className="text-xs font-mono text-zinc-500">you</span>
            )}
            <span className="ml-auto text-xs text-zinc-500">expand</span>
          </div>
          <p className="mt-1 text-sm leading-[1.7] tracking-[0.01em] text-zinc-300">
            {truncated}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={isRoot ? "space-y-2" : "ml-5 border-l border-zinc-800 pl-4 space-y-2"}>
      <div
        className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-2"
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        {isRoot ? (
          <p className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Root conviction</p>
        ) : (
          <div className="flex items-center justify-between">
            {node.authored_by === "user"
              ? <span className="text-xs font-mono text-zinc-500">you</span>
              : <span />}
            <button
              onClick={e => { e.stopPropagation(); setCollapsed(true); }}
              className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
            >
              collapse
            </button>
          </div>
        )}
        <p className={`text-sm leading-[1.7] tracking-[0.01em] ${
          isRoot ? "font-medium text-zinc-100" : "text-zinc-200"
        }`}>
          {node.content}
        </p>
      </div>

      {node.children.map(child => (
        <NodeCard key={child.id} node={child} logDwell={logDwell} />
      ))}
    </div>
  );
}
