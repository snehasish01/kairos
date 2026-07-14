import { Suspense } from "react";
import ConvictionCanvas from "@/components/ConvictionCanvas";

export default function ExplorePage() {
  return (
    <Suspense
      fallback={
        <main className="flex-1 flex items-center justify-center">
          <p className="text-sm text-zinc-400 font-mono animate-pulse">Loading…</p>
        </main>
      }
    >
      <ConvictionCanvas />
    </Suspense>
  );
}
