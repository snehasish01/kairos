export const CONFIG = {
  window:  { commitMin: 0.40, commitMax: 0.75, biasMin: 0.60, disconfirmMax: 0.30 },
  exit:    { commitMin: 0.65, leanVelocityEps: 0.05, maxDanglingCounters: 2 },
  random:  { minEvents: 8, fireProb: 0.05 },
  signals: { recentWindowN: 10 },
  llm:     { temperature: 0.9, maxTokensCard: 1000, maxTokensPrompt: 300 },
} as const
