"use client";

import { useEffect } from "react";
import { captureProlificParams, getProlificIds } from "@/lib/prolific";
import { exitDemo, isDemoActive } from "@/lib/demo/client";

// Renders nothing. Mount on entry pages so Prolific's URL parameters survive
// navigation and refresh via sessionStorage.
export default function ProlificCapture() {
  useEffect(() => {
    captureProlificParams();
    // Arriving from Prolific always leaves demo mode (clears the demo cookie and local state).
    if (getProlificIds() && isDemoActive()) void exitDemo();
  }, []);
  return null;
}
