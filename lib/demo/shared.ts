// Demo-mode constants shared by server and client. No secrets, no server imports.

/** httpOnly cookie set by POST /api/demo. Its mere presence blocks every research route. */
export const DEMO_COOKIE = "kairos_demo";

/** sessionStorage keys (browser only). */
export const DEMO_FLAG_KEY  = "kairos_demo";
export const DEMO_STORE_KEY = "kairos_demo_store";

/** Window event fired when demo mode is entered or exited (banner listens for it). */
export const DEMO_CHANGE_EVENT = "kairos-demo-change";

/** Demo session / participant IDs are never valid UUIDs, so they cannot match a research row. */
export const DEMO_ID_PREFIX = "demo-";

/**
 * Canned prompt used in demo mode when live generation is off or over budget.
 * Identical to the fallback the research path already uses, and identical for every
 * condition, so only timing differs between arms in the demo too.
 */
export const DEMO_CANNED_PROMPT =
  "What have you found yourself avoiding as you explore this conviction?";

/** The two arms run in the pilot. */
export const DEMO_CONDITIONS = ["anticipatory", "reactive"] as const;
export type DemoCondition = (typeof DEMO_CONDITIONS)[number];
