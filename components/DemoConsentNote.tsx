"use client";

import { useEffect, useState } from "react";
import { getProlificIds } from "@/lib/prolific";

// Shown above the consent text when the page was not opened from Prolific: the study is
// closed, so continuing leads to the no-data demo rather than the study.
export default function DemoConsentNote() {
  const [show, setShow] = useState(false);
  // Runs after ProlificCapture's effect (earlier sibling), so URL parameters are captured.
  useEffect(() => { setShow(!getProlificIds()); }, []); // eslint-disable-line react-hooks/set-state-in-effect
  if (!show) return null;
  return (
    <div className="rounded-lg border border-amber-700/60 bg-amber-950/60 px-5 py-4 text-sm text-amber-100 leading-relaxed space-y-1">
      <p className="font-semibold">The KAIROS study is closed.</p>
      <p className="text-amber-200/80">
        The consent text below is shown for reference only. Continuing opens a demo of the
        participant flow. Nothing you enter in the demo is saved.
      </p>
    </div>
  );
}
