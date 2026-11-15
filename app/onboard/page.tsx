"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ALREADY_PARTICIPATED_MSG,
  captureProlificParams,
  getProlificIds,
  isTestPid,
  type ProlificIds,
} from "@/lib/prolific";
import { usePasteGuard, PASTE_BLOCKED_MSG } from "@/lib/use-paste-guard";
import { exitDemo, isDemoActive } from "@/lib/demo/client";
import DemoEntry from "@/components/DemoEntry";

const AGE_RANGES = ["Under 18", "18–24", "25–34", "35–44", "45–54", "55–64", "65+"];
const EDUCATION_LEVELS = [
  "Some high school",
  "High school diploma / GED",
  "Some college",
  "Associate degree",
  "Bachelor's degree",
  "Graduate degree",
  "Doctoral degree",
];

interface Topic { id: string; title: string; description: string }

function leanLabel(v: number): string {
  if (v <= -0.6) return "Strongly disagree";
  if (v <= -0.2) return "Lean toward disagree";
  if (v < 0.2)  return "Genuinely uncertain";
  if (v < 0.6)  return "Lean toward agree";
  return "Strongly agree";
}

export default function OnboardPage() {
  const router = useRouter();
  const [ageRange,         setAgeRange]         = useState("");
  const [education,        setEducation]         = useState("");
  const [topics,           setTopics]            = useState<Topic[]>([]);
  const [topicsLoading,    setTopicsLoading]     = useState(true);
  const [selectedTopicId,  setSelectedTopicId]   = useState("");
  const [leanRaw,          setLeanRaw]           = useState(0);   // -100 to 100
  const [reasons,          setReasons]           = useState("");
  const [submitting,       setSubmitting]        = useState(false);
  const [error,            setError]             = useState("");
  const [prolific,         setProlific]          = useState<ProlificIds | null>(null);
  const { guardProps, pasteBlocked } = usePasteGuard();
  const [prolificStatus,   setProlificStatus]    = useState<"checking" | "missing" | "already" | "ok" | "demo">("checking");

  const priorLean = leanRaw / 100;

  // Prolific gate: capture IDs from the URL (if this is the entry page), then require a
  // PROLIFIC_PID and check for repeat participation before showing the form.
  useEffect(() => {
    captureProlificParams();
    const ids = getProlificIds();
    if (!ids) {
      // No Prolific parameters: the study is closed, so offer the no-data demo instead.
      // One-time read of sessionStorage on mount, not a subscription/external-store sync.
      setProlificStatus(isDemoActive() ? "demo" : "missing"); // eslint-disable-line react-hooks/set-state-in-effect
      return;
    }
    // Arriving from Prolific always leaves demo mode.
    if (isDemoActive()) void exitDemo();
    setProlific(ids);
    if (isTestPid(ids.pid)) {
      setProlificStatus("ok");
      return;
    }
    fetch("/api/participants/check", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ prolific_pid: ids.pid }),
    })
      .then(r => (r.ok ? r.json() : { alreadyParticipated: false }))
      .then((d: { alreadyParticipated?: boolean }) => setProlificStatus(d.alreadyParticipated ? "already" : "ok"))
      // If the check itself fails, continue; the unique index still blocks repeats at insert.
      .catch(() => setProlificStatus("ok"));
  }, []);

  useEffect(() => {
    fetch("/api/topics")
      .then(r => {
        if (!r.ok) throw new Error(`Topics API returned ${r.status}`);
        return r.json();
      })
      .then(({ topics: t }: { topics?: Topic[] }) => setTopics(t ?? []))
      .catch((err) => setError(`Could not load topics: ${(err as Error).message}. Run the pilot migration SQL first.`))
      .finally(() => setTopicsLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!ageRange || !education) {
      setError("Please fill in your age range and education level.");
      return;
    }
    if (!selectedTopicId) {
      setError("Please select a topic to explore.");
      return;
    }
    if (reasons.trim().length < 10) {
      setError("Please give at least one reason for your current lean.");
      return;
    }

    const demo = prolificStatus === "demo";
    if (!prolific && !demo) {
      setProlificStatus("missing");
      return;
    }

    const selectedTopic = topics.find(t => t.id === selectedTopicId);
    if (!selectedTopic) {
      setError("Topic not found. Refresh and try again.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/participants", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        // In demo mode this call is answered in the browser (lib/demo/local-api.ts);
        // nothing is sent to the research database and no Prolific IDs exist.
        body:    JSON.stringify(prolific ? {
          age_range:           ageRange,
          education,
          prolific_pid:        prolific.pid,
          prolific_study_id:   prolific.studyId,
          prolific_session_id: prolific.sessionId,
        } : { age_range: ageRange, education }),
      });
      if (res.status === 409) {
        setProlificStatus("already");
        setSubmitting(false);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Server error");
      }
      const { participantId, condition } = await res.json();

      sessionStorage.removeItem("kairos_sid");
      sessionStorage.removeItem("kairos_root_nid");
      sessionStorage.removeItem("kairos_session_pid");

      sessionStorage.setItem("kairos_pid",        participantId);
      sessionStorage.setItem("kairos_condition",  condition);
      sessionStorage.setItem("kairos_question",   selectedTopic.title);
      sessionStorage.setItem("kairos_topic_id",   selectedTopicId);
      sessionStorage.setItem("kairos_lean",        String(priorLean));
      sessionStorage.setItem("kairos_prior_lean",  String(priorLean));
      sessionStorage.setItem("kairos_reasons",     reasons.trim());

      router.push(`/lobby?pid=${participantId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  const inputCls = "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-100";
  const labelCls = "block text-sm font-medium text-zinc-300";

  if (prolificStatus === "missing") {
    return <DemoEntry onStarted={() => setProlificStatus("demo")} />;
  }

  if (prolificStatus !== "ok" && prolificStatus !== "demo") {
    return (
      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <p className="max-w-md text-center text-sm text-zinc-300 leading-relaxed">
          {prolificStatus === "checking" && "One moment…"}
          {prolificStatus === "already"  && ALREADY_PARTICIPATED_MSG}
        </p>
      </main>
    );
  }

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-16">
      <form onSubmit={handleSubmit} className="w-full max-w-2xl space-y-10">
        <div className="space-y-1">
          <p className="text-xs font-mono tracking-widest text-zinc-400 uppercase">Step 1 of 1</p>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">About you &amp; your conviction</h1>
          <p className="text-zinc-400 text-sm leading-relaxed">
            All answers are anonymous. Take your time — there are no right or wrong answers.
          </p>
        </div>

        {/* Demographics */}
        <fieldset className="space-y-5">
          <legend className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
            Background
          </legend>

          <div className="space-y-1.5">
            <label htmlFor="age" className={labelCls}>Age range</label>
            <select
              id="age"
              value={ageRange}
              onChange={e => setAgeRange(e.target.value)}
              className={inputCls}
            >
              <option value="">Select…</option>
              {AGE_RANGES.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="edu" className={labelCls}>Highest education level</label>
            <select
              id="edu"
              value={education}
              onChange={e => setEducation(e.target.value)}
              className={inputCls}
            >
              <option value="">Select…</option>
              {EDUCATION_LEVELS.map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
        </fieldset>

        <hr className="border-zinc-800" />

        {/* Topic picker */}
        <fieldset className="space-y-4">
          <div className="space-y-1">
            <legend className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
              Your conviction
            </legend>
            <p className="text-sm text-zinc-500">
              Choose the topic you want to explore. You&apos;ll examine your position through a
              series of arguments and perspectives.
            </p>
          </div>

          {topicsLoading ? (
            <p className="text-sm text-zinc-500 font-mono animate-pulse">Loading topics…</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {topics.map(topic => {
                const selected = selectedTopicId === topic.id;
                return (
                  <button
                    key={topic.id}
                    type="button"
                    onClick={() => setSelectedTopicId(topic.id)}
                    className={`text-left rounded-lg border px-4 py-3 transition-colors space-y-2 ${
                      selected
                        ? "border-zinc-100 bg-zinc-900"
                        : "border-zinc-800 bg-zinc-900 hover:border-zinc-600"
                    }`}
                  >
                    <p className={`text-sm font-medium leading-snug ${selected ? "text-zinc-100" : "text-zinc-300"}`}>
                      {topic.title}
                    </p>
                    {selected && topic.description && (
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        {topic.description}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </fieldset>

        <hr className="border-zinc-800" />

        {/* Prior elicitation */}
        <fieldset className="space-y-6">
          <legend className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
            Your stance
          </legend>

          <div className="space-y-3">
            <label className={labelCls}>Where do you stand right now?</label>
            <div className="space-y-2">
              <input
                type="range"
                min={-100}
                max={100}
                step={1}
                value={leanRaw}
                onChange={e => setLeanRaw(Number(e.target.value))}
                className="w-full accent-zinc-100"
              />
              <div className="flex justify-between text-xs text-zinc-500">
                <span>Strongly disagree</span>
                <span
                  className="font-medium text-zinc-300 tabular-nums"
                  aria-live="polite"
                >
                  {leanLabel(priorLean)}
                </span>
                <span>Strongly agree</span>
              </div>
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Drag to show where you currently stand — this anchors the rest of your session.
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="reasons" className={labelCls}>
              In 1–3 sentences, why do you hold this position?
            </label>
            <p className="text-xs text-zinc-500">
              Be honest — this anchors the rest of the session to your actual reasoning.
            </p>
            <textarea
              id="reasons"
              rows={4}
              value={reasons}
              onChange={e => setReasons(e.target.value)}
              placeholder="The main reasons I hold this view are…"
              className={`${inputCls} resize-none`}
              {...guardProps}
            />
            {pasteBlocked && (
              <p role="status" className="text-sm text-zinc-300">{PASTE_BLOCKED_MSG}</p>
            )}
          </div>
        </fieldset>

        {error && (
          <p className="text-sm text-red-400 bg-zinc-900 border border-red-800 rounded-lg px-4 py-3">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || topicsLoading}
          className="w-full bg-zinc-100 text-zinc-950 rounded-lg px-6 py-3 font-medium text-sm hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? "Registering…" : "Begin exploration →"}
        </button>

        <p className="text-sm text-zinc-500 leading-relaxed">
          You&apos;ll explore your conviction through a series of arguments and perspectives.
          Engage with what resonates, push back on what doesn&apos;t, and add your own reasoning at any time.
          There are no right answers — follow your thinking.
        </p>
      </form>
    </main>
  );
}
