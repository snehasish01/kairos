"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function RationalePage() {
  const router = useRouter();
  const [sessionId,  setSessionId]  = useState("");
  const [question,   setQuestion]   = useState("");
  const [text,       setText]       = useState("");
  const [error,      setError]      = useState("");
  const [submitting, setSubmitting] = useState(false);
  const initialized = useRef(false);

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

  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  const ready     = text.trim().length > 0 && !submitting;

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

      <div className="space-y-3">
        <p className="text-sm text-zinc-300 leading-relaxed">
          Write your final position on this question — including the considerations
          that matter most to you and why you hold this view.
        </p>
        <p className="text-xs text-zinc-500 leading-relaxed">
          Take your time. There are no right or wrong answers. This is your reasoning,
          in your own words.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <textarea
          rows={10}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Write your final reasoning here…"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-100 resize-none leading-relaxed"
          autoFocus
        />

        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-zinc-500">
            {wordCount > 0 ? `${wordCount} word${wordCount === 1 ? "" : "s"}` : ""}
          </span>
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
