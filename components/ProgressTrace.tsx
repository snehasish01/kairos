import type { DbNode } from "@/lib/conviction-graph";
import { EDGE_TYPES, EDGE_LABEL, EDGE_BAR } from "@/lib/ui-constants";

interface Props {
  nodes: DbNode[];
}

export default function ProgressTrace({ nodes }: Props) {
  const counts = EDGE_TYPES.reduce<Record<string, number>>((acc, t) => {
    acc[t] = nodes.filter(n => n.edge_type === t).length;
    return acc;
  }, {});

  const max = Math.max(...Object.values(counts), 1);

  return (
    <div className="space-y-3">
      <p className="text-xs font-mono tracking-widest text-zinc-400 uppercase">Reasoning coverage</p>
      <div className="space-y-2.5">
        {EDGE_TYPES.map(t => (
          <div key={t} className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-xs font-mono text-zinc-500">{EDGE_LABEL[t]}</span>
              <span className="text-xs font-mono text-zinc-400 tabular-nums">{counts[t]}</span>
            </div>
            <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${EDGE_BAR[t]}`}
                style={{ width: `${(counts[t] / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
