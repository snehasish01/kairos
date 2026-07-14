import type { EdgeType, Valence } from "./conviction-graph";

export const EDGE_TYPES: EdgeType[] = [
  "observe_world",
  "observe_self",
  "predict_future",
  "reflect_on_prediction",
];

export const EDGE_LABEL: Record<EdgeType, string> = {
  observe_world:         "observe world",
  observe_self:          "observe self",
  predict_future:        "predict future",
  reflect_on_prediction: "reflect on prediction",
};

// Badge colours (for inline tags on cards)
export const EDGE_BG: Record<EdgeType, string> = {
  observe_world:         "bg-blue-100 text-blue-700",
  observe_self:          "bg-violet-100 text-violet-700",
  predict_future:        "bg-amber-100 text-amber-700",
  reflect_on_prediction: "bg-teal-100 text-teal-700",
};

// Bar colours (for ProgressTrace)
export const EDGE_BAR: Record<EdgeType, string> = {
  observe_world:         "bg-blue-400",
  observe_self:          "bg-violet-400",
  predict_future:        "bg-amber-400",
  reflect_on_prediction: "bg-teal-400",
};

export const VALENCE_CLASS: Record<Valence, string> = {
  supports:   "text-emerald-600",
  undermines: "text-rose-600",
  neutral:    "text-zinc-400",
};
