// Canned evidence cards for demo mode when live generation is off or over budget.
// Topic-agnostic on purpose: they exercise the interaction flow, not the content generator.

import type { Card } from "../card-generator";

const POOL: Card[] = [
  { edge_type: "observe_world", valence: "supports",
    headline: "Some real-world evidence lines up with your current view.",
    content:  "Think of the strongest concrete example you know of that fits your position. How representative is it of the wider picture?" },
  { edge_type: "observe_world", valence: "undermines",
    headline: "There is credible evidence pointing the other way.",
    content:  "People who disagree with you usually cite at least one well-documented case or dataset. What is the best version of their evidence?" },
  { edge_type: "observe_world", valence: "neutral",
    headline: "The evidence may depend heavily on how the question is framed.",
    content:  "Small changes in definitions, time horizon or population can flip what the data seem to say. Which framing are you assuming?" },
  { edge_type: "observe_self", valence: "supports",
    headline: "Your own experience gives you a real reason to hold this view.",
    content:  "Personal experience is genuine evidence about at least one case. What exactly did you observe, and how sure are you of it?" },
  { edge_type: "observe_self", valence: "undermines",
    headline: "You may hold this view partly because of who you spend time with.",
    content:  "Views often track our social circle more than the evidence. Would you hold the same position if the people around you disagreed?" },
  { edge_type: "observe_self", valence: "neutral",
    headline: "Notice how confident you feel, separately from why.",
    content:  "Confidence and evidence can come apart. If you rated your certainty from 0 to 100, what number would you give and what drives it?" },
  { edge_type: "predict_future", valence: "supports",
    headline: "If you are right, some outcomes should become more visible soon.",
    content:  "A good position makes predictions. Name one thing you expect to see in the next few years if your view is correct." },
  { edge_type: "predict_future", valence: "undermines",
    headline: "A plausible future would make your view look wrong.",
    content:  "Imagine it is five years from now and your position turned out to be mistaken. What is the most likely story of how that happened?" },
  { edge_type: "predict_future", valence: "neutral",
    headline: "The answer may differ for different groups of people.",
    content:  "Consider whether the outcome you expect is the same for everyone, or whether some groups would see the opposite." },
  { edge_type: "reflect_on_prediction", valence: "supports",
    headline: "Your past predictions on similar questions have held up.",
    content:  "Recall a time you made a similar call. If it held up, what made your reasoning reliable then, and does it apply here?" },
  { edge_type: "reflect_on_prediction", valence: "undermines",
    headline: "What evidence would change your mind, and have you looked for it?",
    content:  "If you cannot name evidence that would change your view, the view may be more of a commitment than a conclusion." },
  { edge_type: "reflect_on_prediction", valence: "neutral",
    headline: "How would you know if your prediction was off?",
    content:  "Decide now what you would count as a miss. Setting that bar in advance keeps you honest when the results come in." },
];

/**
 * Three canned cards (one supports, one undermines, one neutral, mirroring the live
 * generator's balance rule), skipping cards already endorsed into the graph.
 */
export function cannedCards(usedContent: Set<string>, seed: number): Card[] {
  const out: Card[] = [];
  for (const valence of ["supports", "undermines", "neutral"] as const) {
    const options = POOL.filter(c => c.valence === valence && !usedContent.has(c.content));
    const pick = options.length > 0
      ? options[(seed + out.length) % options.length]
      : POOL.filter(c => c.valence === valence)[seed % 4];
    out.push(pick);
  }
  return out;
}
