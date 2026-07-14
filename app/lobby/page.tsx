"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function LobbyPage() {
  return (
    <Suspense>
      <LobbyInner />
    </Suspense>
  );
}

function LobbyInner() {
  const params   = useSearchParams();
  const pid      = params.get("pid") ?? "";
  const creating = useRef(false);

  const [question,  setQuestion]  = useState("");
  const [sessionId, setSessionId] = useState("");
  const [error,     setError]     = useState("");

  useEffect(() => {
    async function init() {
      const storedPid      = sessionStorage.getItem("kairos_pid")       ?? pid;
      const storedQuestion = sessionStorage.getItem("kairos_question") ?? "";
      const storedTopicId  = sessionStorage.getItem("kairos_topic_id") ?? null;
      const priorLean      = parseFloat(sessionStorage.getItem("kairos_lean") ?? "0");
      const priorReasons   = sessionStorage.getItem("kairos_reasons")  ?? "";
      const existingSid    = sessionStorage.getItem("kairos_sid");
      const sessionOwnedBy = sessionStorage.getItem("kairos_session_pid");

      setQuestion(storedQuestion);

      if (existingSid && sessionOwnedBy === storedPid) {
        try {
          const res = await fetch(`/api/sessions/${existingSid}`);
          if (res.ok) {
            const { session } = await res.json();
            if (session?.status === "active") {
              setSessionId(existingSid);
              return;
            }
          }
        } catch {}
        sessionStorage.removeItem("kairos_sid");
        sessionStorage.removeItem("kairos_root_nid");
        sessionStorage.removeItem("kairos_session_pid");
      }

      if (!storedPid || !storedQuestion || creating.current) return;
      creating.current = true;

      fetch("/api/sessions", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          participant_id: storedPid,
          question:       storedQuestion,
          prior_lean:     priorLean,
          prior_reasons:  priorReasons,
          topic_id:       storedTopicId,
        }),
      })
        .then(async res => {
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error ?? "Session creation failed");
          }
          return res.json();
        })
        .then(({ sessionId: sid, rootNodeId: rid }) => {
          sessionStorage.setItem("kairos_sid",         sid);
          sessionStorage.setItem("kairos_root_nid",    rid);
          sessionStorage.setItem("kairos_session_pid", storedPid);
          setSessionId(sid);
        })
        .catch(err => setError(err.message));
    }

    init();
  }, [pid]);

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg space-y-8">
        <div className="space-y-1">
          <p className="text-xs font-mono tracking-widest text-zinc-400 uppercase">
            {sessionId ? "Ready" : "One moment"}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
            {sessionId ? "You're set." : "Setting up your session…"}
          </h1>
        </div>

        {question && (
          <div className="border border-zinc-800 rounded-lg px-5 py-4 space-y-1">
            <p className="text-xs font-mono text-zinc-500">Your conviction</p>
            <p className="text-sm text-zinc-200 italic leading-relaxed">
              &ldquo;{question}&rdquo;
            </p>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-400 bg-zinc-900 border border-red-800 rounded-lg px-4 py-3">
            {error}
          </p>
        )}

        <Link
          href="/explore"
          className={`block w-full text-center bg-zinc-100 text-zinc-950 rounded-lg px-6 py-3 font-medium text-sm transition-colors ${
            sessionId ? "hover:bg-white" : "opacity-30 pointer-events-none"
          }`}
          aria-disabled={!sessionId}
        >
          {sessionId ? "Start exploring →" : "Preparing…"}
        </Link>
      </div>
    </main>
  );
}
