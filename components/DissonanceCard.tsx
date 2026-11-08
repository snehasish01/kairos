"use client";

import { useState } from "react";
import WordLimitCounter from "./WordLimitCounter";
import { MIN_WORDS_PROMPT, MAX_WORDS_PROMPT, countWords, truncateToWords } from "@/lib/word-limits";

interface Props {
  prompt:   string;
  onSubmit: (response: string) => Promise<void>;
}

export default function DissonanceCard({ prompt, onSubmit }: Props) {
  const [response,   setResponse]   = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);
  const [error,      setError]      = useState("");

  const wordCount = countWords(response);
  const ready     = wordCount >= MIN_WORDS_PROMPT && wordCount <= MAX_WORDS_PROMPT && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setSubmitting(true);
    setError("");
    try {
      await onSubmit(response.trim());
      setSubmitted(true);
    } catch {
      setError("Your response could not be saved. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="border border-zinc-700 rounded-lg px-5 py-4 space-y-1 bg-zinc-900">
        <p className="text-xs font-mono tracking-widest text-zinc-500 uppercase">Response recorded</p>
        <p className="text-sm text-zinc-400 leading-relaxed">
          Continue exploring when you&apos;re ready.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-zinc-100 rounded-lg p-5 space-y-4 bg-zinc-900"
    >
      <p className="text-xs font-mono tracking-widest text-zinc-400 uppercase">
        A question for you
      </p>
      <p className="text-sm text-zinc-100 leading-relaxed font-medium">{prompt}</p>
      <textarea
        rows={4}
        value={response}
        onChange={e => setResponse(truncateToWords(e.target.value, MAX_WORDS_PROMPT))}
        placeholder="Take a moment to reflect and respond…"
        className="w-full rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-100 resize-none bg-zinc-800"
      />
      <WordLimitCounter count={wordCount} min={MIN_WORDS_PROMPT} max={MAX_WORDS_PROMPT} />
      <button
        type="submit"
        disabled={!ready}
        className="w-full bg-zinc-100 text-zinc-950 rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {submitting ? "Recording…" : "Submit reflection"}
      </button>
      {error && (
        <p className="text-sm text-red-400 bg-zinc-900 border border-red-800 rounded-lg px-4 py-3">
          {error}
        </p>
      )}
    </form>
  );
}
