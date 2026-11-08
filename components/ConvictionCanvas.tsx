"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { buildGraph, type DbNode, type EdgeType, type Valence } from "@/lib/conviction-graph";
import type { Card } from "@/lib/card-generator";
import { makeEventLogger, type EventLogger } from "@/lib/event-logger";
import NodeCard, { type DwellLogger } from "./NodeCard";
import LeanSlider from "./LeanSlider";
import DissonanceCard from "./DissonanceCard";
import { EDGE_TYPES, EDGE_LABEL } from "@/lib/ui-constants";

const VALENCES: Valence[] = ["supports", "undermines", "neutral"];

export default function ConvictionCanvas() {
  const router = useRouter();
  const [sessionId,   setSessionId]   = useState("");
  const [rootNodeId,  setRootNodeId]  = useState("");
  const [question,    setQuestion]    = useState("");
  const [nodes,       setNodes]       = useState<DbNode[]>([]);
  const [cards,       setCards]       = useState<Card[]>([]);
  const [lean,        setLean]        = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [generating,  setGenerating]  = useState(false);
  const [error,       setError]       = useState("");
  // Open by default every time the explore page loads.
  const [guideOpen,   setGuideOpen]   = useState(true);
  const [addingOwn,   setAddingOwn]   = useState(false);
  const [ownContent,  setOwnContent]  = useState("");
  const [ownEdgeType, setOwnEdgeType] = useState<EdgeType>("observe_world");
  const [ownValence,  setOwnValence]  = useState<Valence>("neutral");
  const [submitting,  setSubmitting]  = useState(false);
  const [triggered,             setTriggered]             = useState(false);
  const [triggerPrompt,         setTriggerPrompt]         = useState("");
  const [triggerId,             setTriggerId]             = useState("");
  const [pendingNavToRationale, setPendingNavToRationale] = useState(false);
  // Contextual lean re-rating: shown inline in the card that was just acted on.
  const [pendingRating, setPendingRating] = useState<{
    card:       Card;
    nodeId:     string | null;
    isWeighted: boolean;
  } | null>(null);
  const [ratingLean, setRatingLean] = useState(0);

  const initialized       = useRef(false);
  const log               = useRef<EventLogger | null>(null);
  const startedAt         = useRef<number>(0);
  const dissonanceCardRef = useRef<HTMLDivElement | null>(null);
  // Stores the work to run after the lean slider is confirmed or skipped.
  const afterRatingRef    = useRef<(() => Promise<void>) | null>(null);
  // Always-current mirror of `triggered` for async callbacks that close over it.
  const triggeredRef      = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const sid  = sessionStorage.getItem("kairos_sid")      ?? "";
    const rid  = sessionStorage.getItem("kairos_root_nid") ?? "";
    const init = parseFloat(sessionStorage.getItem("kairos_lean") ?? "0");
    const q    = sessionStorage.getItem("kairos_question") ?? "";

    if (!sid) {
      // One-time guard on session restore, not a subscription/external-store sync.
      setError("No active session. Please start from the beginning."); // eslint-disable-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }

    setSessionId(sid);
    setRootNodeId(rid);
    setLean(isNaN(init) ? 0 : init);
    setRatingLean(isNaN(init) ? 0 : init);
    setQuestion(q);
    startedAt.current = Date.now();
    log.current = makeEventLogger(sid, startedAt.current);

    fetch(`/api/nodes?session_id=${sid}`)
      .then(r => r.json())
      .then((data: DbNode[]) => {
        setNodes(data);
        setLoading(false);
        setGenerating(true);
        return fetch("/api/cards", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ session_id: sid }),
        });
      })
      .then(r => r.json())
      .then(({ cards: c }: { cards?: Card[] }) => setCards(c ?? []))
      .catch(err => setError(String(err)))
      .finally(() => setGenerating(false));
  }, []);

  async function refreshAfterAdd(sid: string) {
    setGenerating(true);
    try {
      const [nodesData, cardsData] = await Promise.all([
        fetch(`/api/nodes?session_id=${sid}`).then(r => r.json()),
        fetch("/api/cards", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ session_id: sid }),
        }).then(r => r.json()),
      ]);
      setNodes(nodesData as DbNode[]);
      setCards((cardsData as { cards?: Card[] }).cards ?? []);
    } catch {
      setError("Could not refresh cards.");
    } finally {
      setGenerating(false);
    }
  }

  async function refreshCards(sid: string) {
    if (generating) return;
    setGenerating(true);
    try {
      const data = await fetch("/api/cards", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ session_id: sid }),
      }).then(r => r.json());
      setCards((data as { cards?: Card[] }).cards ?? []);
    } catch {
      // silent
    } finally {
      setGenerating(false);
    }
  }

  // ── Trigger helpers ───────────────────────────────────────────────────────

  // On session restore (page refresh), surface any existing DissonanceCard prompt.
  // Does NOT set pendingNavToRationale — that is only set from handleCommitIntent.
  useEffect(() => {
    if (!sessionId) return;
    fetch("/api/trigger", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ session_id: sessionId }),
    })
      .then(r => r.json())
      .then((data: { triggered?: boolean; triggerId?: string; prompt?: string }) => {
        if (data.triggered) {
          setTriggered(true);
          setTriggerId(data.triggerId ?? "");
          setTriggerPrompt(data.prompt || "What have you found yourself avoiding as you explore this conviction?");
        }
      })
      .catch(() => {});
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the always-current ref in sync so async callbacks don't close over stale state.
  // Must run as an effect, not during render: mutating a ref while rendering is
  // undefined behavior under Strict Mode / concurrent rendering and can leave
  // triggeredRef out of sync with `triggered` after a double-render, which is the
  // kind of desync that would make the trigger fire on the backend while the
  // DissonanceCard fails to reliably show up on screen.
  useEffect(() => {
    triggeredRef.current = triggered;
  }, [triggered]);

  // When the dissonance card fires, scroll it into view and clear any pending
  // re-rating block so the two don't compete for the participant's attention.
  useEffect(() => {
    if (triggered && dissonanceCardRef.current) {
      dissonanceCardRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [triggered]);

  async function handleDissonanceResponse(response: string) {
    if (!triggerId) return;
    const res = await fetch(`/api/trigger/${triggerId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ response }),
    });
    // Throwing keeps DissonanceCard open with an error instead of "Response recorded".
    if (!res.ok) throw new Error("Failed to save response");
    if (pendingNavToRationale) {
      router.push("/rationale");
    }
  }

  // "I've reached my position" always proceeds — no signal threshold gates exit.
  // For reactive condition: logs commit_intent, fires prompt, navigates after response.
  // For all other conditions (anticipatory/random already fired, or silent): navigates directly.
  async function handleCommitIntent() {
    if (!sessionId) return;

    if (triggered) {
      router.push("/rationale");
      return;
    }

    await fetch("/api/events", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        session_id: sessionId,
        node_id:    null,
        event_type: "commit_intent",
        payload:    { lean },
        elapsed_ms: Math.round(Date.now() - startedAt.current),
      }),
    }).catch(() => {});

    const data: { triggered?: boolean; triggerId?: string; prompt?: string; alreadyFired?: boolean } =
      await fetch("/api/trigger", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ session_id: sessionId }),
      }).then(r => r.json()).catch(() => ({}));

    if (data.triggered && !data.alreadyFired) {
      setTriggered(true);
      setTriggerId(data.triggerId ?? "");
      setTriggerPrompt(data.prompt || "What have you found yourself avoiding as you explore this conviction?");
      setPendingNavToRationale(true);
    } else {
      router.push("/rationale");
    }
  }

  // ── Contextual lean re-rating ─────────────────────────────────────────────

  async function handleRatingConfirm(newLean: number) {
    setLean(newLean);
    sessionStorage.setItem("kairos_current_lean", String(newLean));
    log.current?.("lean_shift", null, { lean: newLean });

    if (sessionId) {
      fetch("/api/lean-samples", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          session_id: sessionId,
          node_id:    pendingRating?.nodeId ?? null,
          lean_value: newLean,
        }),
      }).catch(() => {});
    }

    setPendingRating(null);
    const after = afterRatingRef.current;
    afterRatingRef.current = null;
    await after?.();
  }

  // ── Graph-mutation handlers ───────────────────────────────────────────────

  async function handleEndorse(card: Card, weight: number) {
    if (!sessionId || !rootNodeId) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/nodes", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          session_id:  sessionId,
          parent_id:   rootNodeId,
          edge_type:   card.edge_type,
          valence:     card.valence,
          content:     card.content,
          authored_by: "system",
        }),
      });
      if (!res.ok) throw new Error("Failed to add node");
      const newNode: DbNode = await res.json();

      // Await event log so DB state is current before the trigger check below.
      await fetch("/api/events", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          session_id:       sessionId,
          node_id:          newNode.id,
          event_type:       weight >= 3 ? "endorse_weighted" : "endorse",
          payload:          { weight },
          // handleEndorse only ever runs inside the onClick handler below, never during render.
          elapsed_ms:       Math.round(Date.now() - startedAt.current), // eslint-disable-line react-hooks/purity
          hidden_valence:   card.valence,
          hidden_edge_type: card.edge_type,
        }),
      }).catch(() => {});

      // Keep the card in place; show the lean slider inline within it.
      setRatingLean(lean);
      setPendingRating({ card, nodeId: newNode.id, isWeighted: weight >= 3 });

      // Defer graph refresh + trigger check until after the participant rates.
      // refreshAfterAdd replaces cards from server — the endorsed card won't be
      // in the new list, so it disappears naturally without an explicit filter.
      const sid = sessionId;
      afterRatingRef.current = async () => {
        await refreshAfterAdd(sid);
        // Check anticipatory / random trigger after each endorse.
        if (!triggeredRef.current) {
          const trigData = await fetch("/api/trigger", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ session_id: sid }),
          }).then(r => r.json() as Promise<{ triggered?: boolean; triggerId?: string; prompt?: string; alreadyFired?: boolean }>)
            .catch(() => ({} as Record<string, never>));

          if (trigData.triggered && !trigData.alreadyFired) {
            setTriggered(true);
            setTriggerId(trigData.triggerId ?? "");
            setTriggerPrompt(trigData.prompt || "What have you found yourself avoiding as you explore this conviction?");
          }
        }
      };
    } catch {
      setError("Failed to endorse card. Try again.");
    } finally {
      setGenerating(false);
    }
  }

  function handleDismiss(card: Card) {
    fetch("/api/events", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        session_id:       sessionId,
        node_id:          null,
        event_type:       "dismiss",
        payload:          null,
        // handleDismiss only ever runs inside the onClick handler below, never during render.
        elapsed_ms:       Math.round(Date.now() - startedAt.current), // eslint-disable-line react-hooks/purity
        hidden_valence:   card.valence,
        hidden_edge_type: card.edge_type,
      }),
    }).catch(() => {});

    // Keep the card in place; show the lean slider inline within it.
    setRatingLean(lean);
    setPendingRating({ card, nodeId: null, isWeighted: false });

    // Capture the remaining count now so we know whether to refresh after rating.
    const willBeEmpty = cards.filter(c => c !== card).length === 0;
    const sid = sessionId;
    afterRatingRef.current = async () => {
      setCards(prev => prev.filter(c => c !== card));
      if (willBeEmpty && sid) await refreshCards(sid);
    };
  }

  async function handleAddOwn(e: React.FormEvent) {
    e.preventDefault();
    if (!ownContent.trim() || !sessionId || !rootNodeId) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/nodes", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          session_id:  sessionId,
          parent_id:   rootNodeId,
          edge_type:   ownEdgeType,
          valence:     ownValence,
          content:     ownContent.trim(),
          authored_by: "user",
        }),
      });
      if (!res.ok) throw new Error("Failed to add node");
      const newNode: DbNode = await res.json();
      log.current?.("add_own", newNode.id, { edge_type: ownEdgeType, valence: ownValence });
      setOwnContent("");
      setAddingOwn(false);
      await refreshAfterAdd(sessionId);
    } catch {
      setError("Failed to add your reasoning. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function closeGuide() {
    setGuideOpen(false);
  }

  function toggleGuide() {
    setGuideOpen(open => !open);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <p className="text-sm text-zinc-400 font-mono animate-pulse">Loading session…</p>
      </main>
    );
  }

  if (!sessionId) {
    return (
      <main className="flex-1 flex items-center justify-center px-4">
        <p className="text-sm text-red-400">{error || "No active session."}</p>
      </main>
    );
  }

  const root = buildGraph(nodes);

  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-10 space-y-10">

      {/* ── Header ── */}
      <div className="space-y-1">
        <div className="flex items-start justify-between gap-4">
          <p className="text-xs font-mono tracking-widest text-zinc-400 uppercase">Exploring</p>
          <button
            onClick={toggleGuide}
            className="shrink-0 text-xs font-mono text-zinc-500 hover:text-zinc-300 transition-colors whitespace-nowrap"
          >
            {guideOpen ? "Hide guide" : "How this works"}
          </button>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight leading-snug">
          {question || root?.content || "Your conviction"}
        </h1>
      </div>

      {/* ── Get-started guide ── */}
      {guideOpen && (
        <div className="border border-zinc-100 rounded-lg p-6 space-y-4 bg-zinc-900">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold tracking-wide text-zinc-100 uppercase">Get started</p>
            <button
              onClick={closeGuide}
              className="shrink-0 text-xs font-medium text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              Got it
            </button>
          </div>
          <ol className="text-sm text-zinc-300 leading-relaxed space-y-3 list-decimal list-outside pl-5 marker:text-zinc-500 marker:font-mono marker:text-xs">
            <li>
              <span className="text-zinc-100 font-medium">Your conviction</span> sits at the top of the
              reasoning graph below.
            </li>
            <li>
              Cards under <span className="text-zinc-100 font-medium">Explore further</span>{" "}
              offer new angles on it. Read one, then{" "}
              <span className="text-zinc-100 font-medium">Endorse</span>{" "}
              it to fold it into your reasoning, or{" "}
              <span className="text-zinc-100 font-medium">Dismiss</span>{" "}
              it and move on — click &ldquo;read more&rdquo; first if you want the full argument.
            </li>
            <li>
              After you act on a card, you&apos;ll be asked to briefly re-rate where you currently stand.
            </li>
            <li>
              Use <span className="text-zinc-100 font-medium">+ Add your own reasoning</span>{" "}
              any time to bring in a point of your own.
            </li>
            <li>
              There&apos;s no required number of cards — click{" "}
              <span className="text-zinc-100 font-medium">I&apos;ve reached my position</span>{" "}
              whenever you&apos;re ready to write up your reasoning. There are no right or wrong
              answers.
            </li>
          </ol>
        </div>
      )}

      {/* ── Dissonance card ── */}
      {triggered && (
        <div ref={dissonanceCardRef}>
          <DissonanceCard
            prompt={triggerPrompt || "What have you found yourself avoiding as you explore this conviction?"}
            onSubmit={handleDissonanceResponse}
          />
        </div>
      )}

      {/* ── Commit ── */}
      {!pendingNavToRationale && (
        <div>
          <button
            onClick={handleCommitIntent}
            className="text-xs font-mono text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            I&apos;ve reached my position
          </button>
        </div>
      )}

      <hr className="border-zinc-800" />

      {/* ── Reasoning graph ── */}
      <section className="space-y-4">
        <p className="text-xs font-mono tracking-widest text-zinc-400 uppercase">Reasoning graph</p>
        {root
          ? (
            <NodeCard
              node={root}
              isRoot
              logDwell={((nodeId, edgeType, valence, isStart) => {
                log.current?.(
                  isStart ? "dwell_start" : "dwell_end",
                  nodeId,
                  { edge_type: edgeType, valence },
                );
              }) satisfies DwellLogger}
            />
          )
          : <p className="text-sm text-zinc-400">No nodes yet.</p>
        }
      </section>

      <hr className="border-zinc-800" />

      {/* ── Generated cards ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between min-h-[1.25rem]">
          <p className="text-xs font-mono tracking-widest text-zinc-400 uppercase">Explore further</p>
          {generating && (
            <span className="text-xs font-mono text-zinc-400 animate-pulse">Generating…</span>
          )}
        </div>

        {cards.length === 0 && !generating && !pendingRating && (
          <p className="text-sm text-zinc-400">
            No candidates. Endorse or add nodes to surface new ones.
          </p>
        )}

        <div className="space-y-2">
          {cards.map((card) => (
            <CandidateCard
              key={`${card.edge_type}:${card.content.slice(0, 40)}`}
              card={card}
              onEndorse={(weight) => handleEndorse(card, weight)}
              onDismiss={() => handleDismiss(card)}
              onOpen={() => log.current?.("open", null, { edge_type: card.edge_type, valence: card.valence })}
              onDwellStart={() => log.current?.("dwell_start", null, { edge_type: card.edge_type, valence: card.valence })}
              onDwellEnd={() => log.current?.("dwell_end", null, { edge_type: card.edge_type, valence: card.valence })}
              disabled={generating || (pendingRating !== null && pendingRating.card !== card)}
              ratingPending={pendingRating?.card === card}
              ratingIsWeighted={pendingRating?.card === card ? (pendingRating?.isWeighted ?? false) : false}
              ratingLean={ratingLean}
              onRatingChange={setRatingLean}
              onRatingConfirm={() => handleRatingConfirm(ratingLean)}
            />
          ))}
        </div>
      </section>

      {/* ── Add own ── */}
      <section>
        {!addingOwn ? (
          <button
            onClick={() => setAddingOwn(true)}
            className="text-sm font-mono text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            + Add your own reasoning
          </button>
        ) : (
          <form onSubmit={handleAddOwn} className="space-y-4 border border-zinc-800 rounded-lg p-5">
            <p className="text-xs font-mono tracking-widest text-zinc-400 uppercase">Your reasoning</p>
            <textarea
              rows={3}
              value={ownContent}
              onChange={e => setOwnContent(e.target.value)}
              placeholder="What else are you thinking about this conviction?"
              className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500 resize-none"
            />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-zinc-500 font-mono">Reasoning type</label>
                <select
                  value={ownEdgeType}
                  onChange={e => setOwnEdgeType(e.target.value as EdgeType)}
                  className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500"
                >
                  {EDGE_TYPES.map(t => (
                    <option key={t} value={t}>{EDGE_LABEL[t]}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-500 font-mono">Stance</label>
                <select
                  value={ownValence}
                  onChange={e => setOwnValence(e.target.value as Valence)}
                  className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500"
                >
                  {VALENCES.map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={submitting || !ownContent.trim()}
                className="flex-1 bg-zinc-100 text-zinc-950 rounded-lg px-4 py-2 text-sm font-medium hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Adding…" : "Add to graph"}
              </button>
              <button
                type="button"
                onClick={() => { setAddingOwn(false); setOwnContent(""); }}
                className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>

      {error && (
        <p className="text-sm text-red-400 bg-zinc-900 border border-red-800 rounded-lg px-4 py-3">
          {error}
        </p>
      )}
    </main>
  );
}

// ── CandidateCard ─────────────────────────────────────────────────────────────

interface CandidateProps {
  card:             Card;
  onEndorse:        (weight: number) => void;
  onDismiss:        () => void;
  onOpen:           () => void;
  onDwellStart:     () => void;
  onDwellEnd:       () => void;
  disabled:         boolean;
  ratingPending:    boolean;
  ratingIsWeighted: boolean;
  ratingLean:       number;
  onRatingChange:   (v: number) => void;
  onRatingConfirm:  () => void;
}

const DWELL_DELAY_MS = 200;

function CandidateCard({
  card, onEndorse, onDismiss, onOpen, onDwellStart, onDwellEnd, disabled,
  ratingPending, ratingIsWeighted, ratingLean, onRatingChange, onRatingConfirm,
}: CandidateProps) {
  const [expanded, setExpanded] = useState(false);
  // Log 'open' once when this card instance first mounts (content-keyed above).
  useEffect(() => { onOpen(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const timer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dwelling = useRef(false);

  function handleEnter() {
    timer.current = setTimeout(() => {
      dwelling.current = true;
      onDwellStart();
    }, DWELL_DELAY_MS);
  }

  function handleLeave() {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (dwelling.current) { dwelling.current = false; onDwellEnd(); }
  }

  const displayText = card.headline || (card.content.length > 100
    ? `${card.content.slice(0, 100)}…`
    : card.content);

  // Rating pending: lean slider replaces the card actions in place.
  if (ratingPending) {
    return (
      <div
        className={`border rounded-lg p-4 space-y-3 ${
          ratingIsWeighted ? "border-zinc-100 bg-zinc-900" : "border-zinc-700 bg-zinc-900"
        }`}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        <p className="text-[11px] font-mono text-zinc-600 uppercase tracking-widest truncate">
          {displayText}
        </p>
        <p className="text-xs font-mono text-zinc-400 uppercase tracking-widest">
          {ratingIsWeighted ? "This felt significant — where do you stand now?" : "Where do you stand now?"}
        </p>
        <LeanSlider value={ratingLean} onChange={onRatingChange} />
        <div className="pt-1">
          <button
            onClick={onRatingConfirm}
            className="text-xs font-medium text-zinc-100 hover:underline transition-colors"
          >
            Confirm position →
          </button>
        </div>
      </div>
    );
  }

  // Collapsed: headline + inline endorse/dismiss. Expansion is optional via "read more →".
  if (!expanded) {
    return (
      <div
        className="border border-zinc-800 rounded-lg px-4 py-3 bg-zinc-900 hover:border-zinc-700 transition-colors space-y-3"
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm leading-snug tracking-[0.01em] text-zinc-200 font-medium">{displayText}</p>
          <button
            onClick={() => setExpanded(true)}
            className="shrink-0 text-xs text-zinc-600 hover:text-zinc-400 transition-colors whitespace-nowrap pt-0.5"
          >
            read more →
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onEndorse(1)}
            disabled={disabled}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-zinc-100 hover:text-zinc-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Endorse
          </button>
          <button
            onClick={onDismiss}
            disabled={disabled}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  // Expanded: full argument text + all three actions (including weighted endorse).
  return (
    <div
      className="border border-zinc-100 rounded-lg p-6 bg-zinc-900 space-y-3"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <div className="flex items-center justify-end">
        <button
          onClick={() => setExpanded(false)}
          className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
        >
          collapse
        </button>
      </div>
      <p className="text-sm leading-[1.7] tracking-[0.01em] text-zinc-200">{card.content}</p>
      <div className="flex gap-2 flex-wrap pt-1">
        <button
          onClick={() => onEndorse(1)}
          disabled={disabled}
          className="rounded-md border border-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-100 hover:bg-zinc-100 hover:text-zinc-950 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Endorse
        </button>
        <button
          onClick={onDismiss}
          disabled={disabled}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
