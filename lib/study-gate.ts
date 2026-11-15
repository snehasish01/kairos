// Server-only: the study is CLOSED unless STUDY_OPEN=true.
//
// While closed, every research route (anything that reads or writes participants,
// sessions, nodes, events, lean samples, triggers, prompt events, final rationale,
// session outcome or the mailing list) refuses with 403. The demo is unaffected: it never
// uses those routes. Set STUDY_OPEN=true only for a deployment that is actively collecting
// data; with it set, the research path behaves exactly as in v1.0-pilot.

import { NextResponse, type NextRequest } from "next/server";
import { rejectIfDemo } from "./demo/token";

export const STUDY_CLOSED_MSG = "This study is closed and is no longer accepting participants.";

export function studyOpen(): boolean {
  return process.env.STUDY_OPEN === "true";
}

export function studyClosed(): NextResponse {
  return NextResponse.json({ error: STUDY_CLOSED_MSG, code: "study_closed" }, { status: 403 });
}

/**
 * Guard for research routes: refuse demo-cookie requests (403 demo_mode) and, unless
 * STUDY_OPEN=true, refuse everything else too (403 study_closed).
 */
export function guardResearch(req: NextRequest): NextResponse | null {
  return rejectIfDemo(req) ?? (studyOpen() ? null : studyClosed());
}
