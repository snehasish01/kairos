"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import WordLimitCounter from "@/components/WordLimitCounter";
import { usePasteGuard, PASTE_BLOCKED_MSG } from "@/lib/use-paste-guard";
import { MIN_WORDS_FINAL, MAX_WORDS_FINAL, countWords, truncateToWords } from "@/lib/word-limits";

export default function RationalePage() {
  const router = useRouter();
  const [sessionId,  setSessionId]  = useState("");
  const [question,   setQuestion]   = useState("");
  const [text,       setText]       = useState("");
  const [error,      setError]      = useState("");
  const [submitting, setSubmitting] = useState(false);
  const initialized = useRef(false);
  const { guardProps, pasteBlocked } = usePasteGuard();

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const sid = sessionStorage.getItem("kairos_sid")      ?? "";
    const q   = sessionStorage.getItem("kairos_question") ?? "";
    if (!sid) {
      setError("No active session. Please start from the beginning.");
      return;
    }
    setSessionId(sid);
    setQuestion(q);
  }, []);

  const wordCount = countWords(text);
  const ready     = wordCount >= MIN_WORDS_FINAL && wordCount <= MAX_WORDS_FINAL && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || !sessionId) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/rationale", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ session_id: sessionId, text: text.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Failed to save rationale");
      }
      // Lets /debrief show the Prolific completion button only after a successful save.
      sessionStorage.setItem("kairos_rationale_saved_sid", sessionId);
      router.push("/debrief");
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  if (!sessionId && error) {
    return (
      <main className="flex-1 flex items-center justify-center px-4">
        <p className="text-sm text-red-400">{error}</p>
      </main>
    );
  }

  return (
    <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-10 space-y-10">

      <div className="space-y-1">
        <p className="text-xs font-mono tracking-widest text-zinc-400 uppercase">Final step</p>
        <h1 className="text-2xl font-semibold tracking-tight leading-snug text-zinc-100">
          Where do you stand?
        </h1>
      </div>

      {question && (
        <div className="border border-zinc-800 rounded-lg px-5 py-4 space-y-1">
          <p className="text-xs font-mono text-zinc-500">Your conviction</p>
          <p className="text-sm text-zinc-300 italic leading-relaxed">&ldquo;{question}&rdquo;</p>
        </div>
      )}

      {/* Instructions: pinned on md+, collapsible (open by default) on all widths. */}
      <details
        open
        className="border-2 border-zinc-300 rounded-lg px-5 py-4 bg-zinc-900 shadow-lg shadow-black/50 md:sticky md:top-4 md:z-20"
      >
        <summary className="cursor-pointer text-lg font-semibold text-zinc-100 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-100">
          Instructions
        </summary>
        <div className="mt-3 space-y-3">
          <p className="text-base text-zinc-100 leading-relaxed">
            Write your final position on this question — including the considerations
            that matter most to you and why you hold this view.
          </p>
          <p className="text-base text-zinc-300 leading-relaxed">
            Take your time. There are no right or wrong answers. This is your reasoning,
            in your own words.
          </p>
        </div>
      </details>

      <form onSubmit={handleSubmit} className="space-y-4">
        <textarea
          rows={10}
          value={text}
          onChange={e => setText(truncateToWords(e.target.value, MAX_WORDS_FINAL))}
          placeholder="Write your final reasoning here…"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-100 resize-none leading-relaxed"
          autoFocus
          {...guardProps}
        />
        {pasteBlocked && (
          <p role="status" className="text-sm text-zinc-300">{PASTE_BLOCKED_MSG}</p>
        )}

        <div className="flex items-start justify-between gap-4">
          <WordLimitCounter count={wordCount} min={MIN_WORDS_FINAL} max={MAX_WORDS_FINAL} />
          <button
            type="submit"
            disabled={!ready}
            className="bg-zinc-100 text-zinc-950 rounded-lg px-5 py-2 text-sm font-medium hover:bg-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {submitting ? "Saving…" : "Submit and continue →"}
          </button>
        </div>

        {error && (
          <p className="text-sm text-red-400 bg-zinc-900 border border-red-800 rounded-lg px-4 py-3">
            {error}
          </p>
        )}
      </form>
    </main>
  );
}
