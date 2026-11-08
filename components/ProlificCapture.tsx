"use client";

import { useEffect } from "react";
import { captureProlificParams } from "@/lib/prolific";

// Renders nothing. Mount on entry pages so Prolific's URL parameters survive
// navigation and refresh via sessionStorage.
export default function ProlificCapture() {
  useEffect(() => { captureProlificParams(); }, []);
  return null;
}
