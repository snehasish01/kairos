"use client";

import { useState } from "react";

interface Props {
  prompt:   string;
  onSubmit: (response: string) => Promise<void>;
}

export default function DissonanceCard({ prompt, onSubmit }: Props) {
  const [response,   setResponse]   = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!response.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(response.trim());
      setSubmitted(true);
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
        onChange={e => setResponse(e.target.value)}
        placeholder="Take a moment to reflect and respond…"
        className="w-full rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-100 resize-none bg-zinc-800"
      />
      <button
        type="submit"
        disabled={submitting || !response.trim()}
        className="w-full bg-zinc-100 text-zinc-950 rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {submitting ? "Recording…" : "Submit reflection"}
      </button>
    </form>
  );
}
