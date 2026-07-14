"use client";

import { useEffect, useRef, useState } from "react";

interface DebriefData {
  initialLean:      number;
  finalLean:        number;
  confirmationSkew: { supportingEngaged: number; underminingEngaged: number; neutralEngaged: number };
  operationDist:    Record<string, number>;
  rung2and4Covered: boolean;
  leanTrajectory:   { lean: number; elapsed_s: number }[];
  promptFired:      boolean;
  promptText:       string | null;
  promptResponse:   string | null;
  promptElapsed_s:  number | null;
}

export default function DebriefPage() {
  const [question, setQuestion] = useState("");
  const [data,     setData]     = useState<DebriefData | null>(null);
  const [loadErr,  setLoadErr]  = useState("");

  const [email,       setEmail]       = useState("");
  const [emailState,  setEmailState]  = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [emailErrMsg, setEmailErrMsg] = useState("");

  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const sid = sessionStorage.getItem("kairos_sid")      ?? "";
    const q   = sessionStorage.getItem("kairos_question") ?? "";
    setQuestion(q);
    if (!sid) { setLoadErr("No active session."); return; }

    fetch(`/api/debrief?session_id=${sid}`)
      .then(r => r.json())
      .then((d: DebriefData | { error?: string }) => {
        if ("error" in d && d.error) { setLoadErr(d.error); return; }
        setData(d as DebriefData);
      })
      .catch(() => setLoadErr("Could not load session portrait."));
  }, []);

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setEmailState("submitting");
    setEmailErrMsg("");
    try {
      const res = await fetch("/api/mailing-list", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Failed to save email");
      }
      setEmailState("done");
    } catch (err) {
      setEmailErrMsg((err as Error).message);
      setEmailState("error");
    }
  }

  if (loadErr) {
    return (
      <main className="flex-1 flex items-center justify-center px-4">
        <p className="text-sm text-red-400">{loadErr}</p>
      </main>
    );
  }

  return (
    <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-10 space-y-10">

      {/* ── Header ── */}
      <div className="space-y-1">
        <p className="text-xs font-mono tracking-widest text-zinc-400 uppercase">Your portrait</p>
        <h1 className="text-2xl font-semibold tracking-tight leading-snug text-zinc-100">
          Here is what happened.
        </h1>
      </div>

      {question && (
        <div className="border border-zinc-800 rounded-lg px-5 py-4 space-y-1">
          <p className="text-xs font-mono text-zinc-500">You explored</p>
          <p className="text-sm text-zinc-300 italic leading-relaxed">&ldquo;{question}&rdquo;</p>
        </div>
      )}

      {data && (
        <>
          {/* ── 1. Lean arc ── */}
          <section className="space-y-3">
            <p className="text-xs font-mono tracking-widest text-zinc-400 uppercase">Your position</p>
            <LeanArc
              initialLean={data.initialLean}
              finalLean={data.finalLean}
              promptFired={data.promptFired}
              promptElapsed_s={data.promptElapsed_s}
              leanTrajectory={data.leanTrajectory}
            />
          </section>

          {/* ── Lean trajectory ── */}
          {data.leanTrajectory.length >= 2 && (
            <section className="space-y-2">
              <p className="text-xs font-mono tracking-widest text-zinc-400 uppercase">
                How your position moved
              </p>
              <LeanSparkline trajectory={data.leanTrajectory} />
              <p className="text-xs text-zinc-500">
                Each point is where you placed yourself after an interaction.
              </p>
            </section>
          )}

          {/* ── 2. Confirmation ratio ── */}
          {(data.confirmationSkew.supportingEngaged +
            data.confirmationSkew.underminingEngaged +
            data.confirmationSkew.neutralEngaged) > 0 && (
            <section className="space-y-3">
              <p className="text-xs font-mono tracking-widest text-zinc-400 uppercase">
                How you engaged
              </p>
              <ConfirmationRatio
                supportingEngaged={data.confirmationSkew.supportingEngaged}
                underminingEngaged={data.confirmationSkew.underminingEngaged}
                neutralEngaged={data.confirmationSkew.neutralEngaged}
              />
            </section>
          )}

          {/* ── 3. Reasoning fingerprint ── */}
          <section className="space-y-4">
            <p className="text-xs font-mono tracking-widest text-zinc-400 uppercase">
              Your reasoning fingerprint
            </p>
            <ReasoningFingerprint dist={data.operationDist} />
            <ReasoningInsight dist={data.operationDist} covered={data.rung2and4Covered} />
          </section>

          {/* ── Prompt moment ── */}
          {data.promptFired && (
            <section className="space-y-3 border-l-2 border-zinc-100 pl-5">
              <p className="text-xs font-mono tracking-widest text-zinc-400 uppercase">
                Reflection moment
              </p>
              {data.promptElapsed_s != null && (
                <p className="text-xs text-zinc-500">
                  {formatElapsed(data.promptElapsed_s)} into your session, you were asked:
                </p>
              )}
              {data.promptText && (
                <p className="text-sm text-zinc-200 italic leading-relaxed">
                  &ldquo;{data.promptText}&rdquo;
                </p>
              )}
              {data.promptResponse ? (
                <div className="space-y-1">
                  <p className="text-xs font-mono text-zinc-500">You wrote</p>
                  <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                    {data.promptResponse}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-zinc-500 italic">You did not respond to this question.</p>
              )}
            </section>
          )}
        </>
      )}

      <hr className="border-zinc-800" />

      {/* ── Thank you ── */}
      <section className="space-y-2">
        <p className="text-xs font-mono tracking-widest text-zinc-400 uppercase">Complete</p>
        <h2 className="text-lg font-semibold text-zinc-100">Thank you.</h2>
        <p className="text-sm text-zinc-400 leading-relaxed">
          Your exploration has been recorded. You can close this window.
        </p>
      </section>

      {/* ── Email opt-in ── */}
      <section className="border border-zinc-800 rounded-lg px-5 py-5 space-y-4">
        <div className="space-y-1">
          <p className="text-xs font-mono tracking-widest text-zinc-400 uppercase">Stay informed</p>
          <p className="text-sm text-zinc-300 leading-relaxed">
            If you&apos;d like to receive a summary of findings when this study is complete,
            share your email below. This is completely optional and unlinked from your session.
          </p>
        </div>

        {emailState === "done" ? (
          <p className="text-sm text-zinc-400">Got it — we&apos;ll be in touch with results.</p>
        ) : (
          <form onSubmit={handleEmailSubmit} className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-100"
            />
            <button
              type="submit"
              disabled={!email.trim() || emailState === "submitting"}
              className="rounded-lg bg-zinc-100 text-zinc-950 px-4 py-2 text-sm font-medium hover:bg-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {emailState === "submitting" ? "…" : "Notify me"}
            </button>
          </form>
        )}

        {emailState === "error" && emailErrMsg && (
          <p className="text-xs text-red-400">{emailErrMsg}</p>
        )}
      </section>

    </main>
  );
}

// ── 1. Lean arc ────────────────────────────────────────────────────────────────
// Quadratic bezier from initial lean (left) to final lean (right).
// Y-axis: lean=-1 → bottom, lean=0 → midline, lean=1 → top.
// A ring dot marks where the prompt fired along the arc if it did.

function LeanArc({
  initialLean, finalLean, promptFired, promptElapsed_s, leanTrajectory,
}: {
  initialLean:     number;
  finalLean:       number;
  promptFired:     boolean;
  promptElapsed_s: number | null;
  leanTrajectory:  { lean: number; elapsed_s: number }[];
}) {
  const W = 320, H = 80;
  const PAD_X = 24, PAD_Y = 14;

  const leanToY = (v: number) => PAD_Y + (1 - v) / 2 * (H - PAD_Y * 2);
  const neutralY = leanToY(0);

  const x0 = PAD_X;
  const x1 = W - PAD_X;
  const y0 = leanToY(initialLean);
  const y1 = leanToY(finalLean);
  const cpX = (x0 + x1) / 2;
  // Arc the control point above both endpoints for an upward bow
  const cpY = Math.min(y0, y1) - 18;

  const arcPath = `M ${x0} ${y0.toFixed(1)} Q ${cpX} ${cpY.toFixed(1)} ${x1} ${y1.toFixed(1)}`;

  // Prompt dot: quadratic bezier point at parameter t
  let dotX: number | null = null;
  let dotY: number | null = null;
  if (promptFired && promptElapsed_s != null && leanTrajectory.length >= 1) {
    const maxElapsed = leanTrajectory[leanTrajectory.length - 1].elapsed_s;
    if (maxElapsed > 0) {
      const t  = Math.max(0, Math.min(1, promptElapsed_s / maxElapsed));
      const mt = 1 - t;
      dotX = mt * mt * x0 + 2 * mt * t * cpX + t * t * x1;
      dotY = mt * mt * y0 + 2 * mt * t * cpY + t * t * y1;
    }
  }

  const leanLabel = (v: number) => {
    if (v <= -0.6) return "strongly against";
    if (v <= -0.2) return "leaning against";
    if (v <   0.2) return "uncertain";
    if (v <   0.6) return "leaning toward";
    return "strongly in favor";
  };

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        className="overflow-visible"
        aria-hidden="true"
      >
        {/* Neutral reference */}
        <line
          x1={PAD_X} y1={neutralY.toFixed(1)}
          x2={W - PAD_X} y2={neutralY.toFixed(1)}
          stroke="#3f3f46"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
        {/* Arc */}
        <path d={arcPath} fill="none" stroke="#71717a" strokeWidth="1.5" strokeLinecap="round" />
        {/* Start dot (muted) */}
        <circle cx={x0} cy={y0.toFixed(1)} r="3" fill="#52525b" />
        {/* End dot (bright — current position) */}
        <circle cx={x1} cy={y1.toFixed(1)} r="4" fill="#f4f4f5" />
        {/* Prompt ring */}
        {dotX != null && dotY != null && (
          <>
            <circle cx={dotX.toFixed(1)} cy={dotY!.toFixed(1)} r="5" fill="none" stroke="#f4f4f5" strokeWidth="1.5" />
            <circle cx={dotX.toFixed(1)} cy={dotY!.toFixed(1)} r="2" fill="#f4f4f5" />
          </>
        )}
      </svg>

      {/* Plain-language labels */}
      <div className="flex justify-between text-xs">
        <span className="text-zinc-500">{leanLabel(initialLean)}</span>
        <span className="text-zinc-200 font-medium">{leanLabel(finalLean)}</span>
      </div>
      {promptFired && (
        <p className="text-xs text-zinc-600 text-center">◎ prompt moment</p>
      )}
    </div>
  );
}

// ── 2. Confirmation ratio ──────────────────────────────────────────────────────
// Horizontal SVG bar: supporting (bright) | neutral (mid) | challenging (dark bg).
// One sentence below reflects the skew.

function ConfirmationRatio({
  supportingEngaged, underminingEngaged, neutralEngaged,
}: {
  supportingEngaged:  number;
  underminingEngaged: number;
  neutralEngaged:     number;
}) {
  const total = supportingEngaged + underminingEngaged + neutralEngaged;
  if (total === 0) return null;

  const W = 300;
  const supW = Math.round((supportingEngaged  / total) * W);
  const neuW = Math.round((neutralEngaged     / total) * W);

  const skewSentence = (): string => {
    if (underminingEngaged === 0 && neutralEngaged === 0)
      return "You engaged only with evidence that supported your view.";
    // Use supporting vs undermining ratio only — neutral cards don't indicate directional bias.
    const directional = supportingEngaged + underminingEngaged;
    const supRatio = directional > 0 ? supportingEngaged / directional : 0.5;
    if (supRatio >= 0.80) return "You engaged mostly with supporting evidence — very little that challenged your view.";
    if (supRatio >= 0.60) return "You engaged more with supporting evidence than challenging.";
    if (supRatio <= 0.40 && underminingEngaged > supportingEngaged)
      return "You engaged more with challenging evidence than supporting — that's unusual.";
    return "You engaged fairly evenly with supporting and challenging evidence.";
  };

  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${W} 12`} width="100%" aria-hidden="true">
        <defs>
          <clipPath id="cr-bar-clip">
            <rect x="0" y="0" width={W} height="12" rx="6" />
          </clipPath>
        </defs>
        {/* dark track */}
        <rect x="0" y="0" width={W} height="12" rx="6" fill="#27272a" />
        {/* supporting segment */}
        {supW > 0 && (
          <rect x="0" y="0" width={supW} height="12" fill="#f4f4f5" clipPath="url(#cr-bar-clip)" />
        )}
        {/* neutral segment */}
        {neuW > 0 && (
          <rect x={supW} y="0" width={neuW} height="12" fill="#52525b" clipPath="url(#cr-bar-clip)" />
        )}
      </svg>
      <div className="flex justify-between text-xs text-zinc-500">
        <span>{supportingEngaged} supporting</span>
        {neutralEngaged > 0 && <span>{neutralEngaged} neutral</span>}
        <span>{underminingEngaged} challenging</span>
      </div>
      <p className="text-xs text-zinc-400 leading-relaxed">{skewSentence()}</p>
    </div>
  );
}

// ── 3. Reasoning fingerprint ───────────────────────────────────────────────────
// 4-axis radar chart showing how the participant distributed their reasoning
// across the four operation types.

const FINGERPRINT_AXES = [
  { key: "observe_world",         label: "observe world",       angle: -Math.PI / 2 }, // top
  { key: "predict_future",        label: "predict future",      angle: 0 },             // right
  { key: "reflect_on_prediction", label: "reflect on prediction", angle: Math.PI / 2 }, // bottom
  { key: "observe_self",          label: "observe self",        angle: Math.PI },        // left
] as const;

function ReasoningFingerprint({ dist }: { dist: Record<string, number> }) {
  const CX = 145, CY = 90, R = 60;
  const VW = 300, VH = 210;

  const maxCount = Math.max(...FINGERPRINT_AXES.map(a => dist[a.key] ?? 0), 1);

  const pt = (angle: number, mag: number) => ({
    x: CX + Math.cos(angle) * mag * R,
    y: CY + Math.sin(angle) * mag * R,
  });

  const gridPoints = (mag: number) =>
    FINGERPRINT_AXES.map(a => {
      const p = pt(a.angle, mag);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    }).join(" ");

  const dataPoints = FINGERPRINT_AXES.map(a => {
    const mag = (dist[a.key] ?? 0) / maxCount;
    const p   = pt(a.angle, mag);
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  }).join(" ");

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" aria-hidden="true">
      {/* Outer grid diamond */}
      <polygon points={gridPoints(1)} fill="none" stroke="#3f3f46" strokeWidth="1" />
      {/* Inner grid at 50% */}
      <polygon points={gridPoints(0.5)} fill="none" stroke="#27272a" strokeWidth="1" strokeDasharray="2 3" />
      {/* Axes */}
      {FINGERPRINT_AXES.map(a => {
        const p = pt(a.angle, 1);
        return (
          <line
            key={a.key}
            x1={CX} y1={CY}
            x2={p.x.toFixed(1)} y2={p.y.toFixed(1)}
            stroke="#3f3f46"
            strokeWidth="1"
          />
        );
      })}
      {/* Data polygon */}
      <polygon
        points={dataPoints}
        fill="#f4f4f5"
        fillOpacity="0.12"
        stroke="#f4f4f5"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Dots at each data point */}
      {FINGERPRINT_AXES.map(a => {
        const mag = (dist[a.key] ?? 0) / maxCount;
        const p   = pt(a.angle, mag);
        return <circle key={a.key} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="2.5" fill="#f4f4f5" />;
      })}
      {/* Axis labels */}
      {FINGERPRINT_AXES.map(a => {
        const labelR = R + 16;
        const lx = CX + Math.cos(a.angle) * labelR;
        const ly = CY + Math.sin(a.angle) * labelR;
        const anchor =
          Math.abs(a.angle) < 0.1 ? "start" :
          Math.abs(Math.abs(a.angle) - Math.PI) < 0.1 ? "end" :
          "middle";
        const dy =
          a.angle < -1 ? "-0.4em" :   // top
          a.angle > 1  ? "1.1em"  :   // bottom
          "0.35em";                    // left / right
        return (
          <text
            key={a.key}
            x={lx.toFixed(1)}
            y={ly.toFixed(1)}
            textAnchor={anchor}
            dy={dy}
            fontSize="9"
            fill="#71717a"
            fontFamily="ui-monospace, monospace"
          >
            {a.label}
          </text>
        );
      })}
      {/* Count annotations at axis tips */}
      {FINGERPRINT_AXES.map(a => {
        const count = dist[a.key] ?? 0;
        const tipR  = R + 6;
        const tx = CX + Math.cos(a.angle) * tipR;
        const ty = CY + Math.sin(a.angle) * tipR;
        if (count === 0) return null;
        return (
          <text
            key={`${a.key}-count`}
            x={tx.toFixed(1)}
            y={ty.toFixed(1)}
            textAnchor="middle"
            dy="0.35em"
            fontSize="8"
            fill="#a1a1aa"
            fontFamily="ui-monospace, monospace"
          >
            {count}
          </text>
        );
      })}
    </svg>
  );
}

// ── Lean sparkline ─────────────────────────────────────────────────────────────

function LeanSparkline({ trajectory }: { trajectory: { lean: number; elapsed_s: number }[] }) {
  if (trajectory.length < 2) return null;

  const W = 300, H = 60, PAD_X = 4, PAD_Y = 6;
  const maxElapsed = trajectory[trajectory.length - 1].elapsed_s || 1;

  const toX = (s: number) => PAD_X + (s / maxElapsed) * (W - PAD_X * 2);
  const toY = (v: number) => PAD_Y + ((1 - v) / 2) * (H - PAD_Y * 2);
  const neutralY = toY(0).toFixed(1);
  const points   = trajectory.map(p => `${toX(p.elapsed_s).toFixed(1)},${toY(p.lean).toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="none" className="h-16 w-full" aria-hidden="true">
      <line x1={PAD_X} y1={neutralY} x2={W - PAD_X} y2={neutralY} stroke="#3f3f46" strokeWidth="1" strokeDasharray="3 3" />
      <polyline points={points} fill="none" stroke="#f4f4f5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {trajectory.map((p, i) => (
        <circle key={i} cx={toX(p.elapsed_s).toFixed(1)} cy={toY(p.lean).toFixed(1)} r="2.5" fill="#f4f4f5" />
      ))}
    </svg>
  );
}

// ── Reasoning insight text ─────────────────────────────────────────────────────

function ReasoningInsight({ dist, covered }: { dist: Record<string, number>; covered: boolean }) {
  const lines: string[] = [];
  if (dist.predict_future > 0 && dist.reflect_on_prediction === 0)
    lines.push(`You predicted the future ${dist.predict_future} time${dist.predict_future > 1 ? "s" : ""} but never reflected on those predictions.`);
  if (dist.observe_self === 0)
    lines.push("You didn’t turn the lens on yourself this session.");
  if (covered)
    lines.push("You moved through all four reasoning types — including the deepest reflective rungs.");
  if (lines.length === 0) return null;
  return (
    <div className="space-y-1">
      {lines.map((l, i) => <p key={i} className="text-xs text-zinc-500 leading-relaxed">{l}</p>)}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatElapsed(s: number): string {
  if (s < 60) return `${s} second${s === 1 ? "" : "s"}`;
  const m = Math.round(s / 60);
  return `${m} minute${m === 1 ? "" : "s"}`;
}
