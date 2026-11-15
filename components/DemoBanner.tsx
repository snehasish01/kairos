"use client";

import { useEffect, useState } from "react";
import { installDemoFetchShim } from "@/lib/demo/fetch-shim";
import { exitDemo, isDemoActive } from "@/lib/demo/client";
import { DEMO_CHANGE_EVENT } from "@/lib/demo/shared";

// Install at module load so it is in place before any page's mount effect calls fetch.
installDemoFetchShim();

/** Persistent "Demo, no data is saved" banner, shown on every page while in demo mode. */
export default function DemoBanner() {
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    const sync = () => setDemo(isDemoActive());
    sync();
    window.addEventListener(DEMO_CHANGE_EVENT, sync);
    return () => window.removeEventListener(DEMO_CHANGE_EVENT, sync);
  }, []);

  if (!demo) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-50 w-full border-b border-amber-700/60 bg-amber-950 px-4 py-2 text-amber-100"
    >
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
        <p>
          <span className="font-semibold">Demo, no data is saved.</span>{" "}
          <span className="text-amber-200/80">The KAIROS study is closed. Nothing you enter here is recorded.</span>
        </p>
        <button
          type="button"
          onClick={async () => { await exitDemo(); window.location.assign("/consent"); }}
          className="text-xs underline underline-offset-2 hover:text-white"
        >
          Exit demo
        </button>
      </div>
    </div>
  );
}
