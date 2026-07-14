"use client";

function leanLabel(v: number): string {
  if (v <= -0.6) return "Strongly against";
  if (v <= -0.2) return "Lean against";
  if (v <   0.2) return "Genuinely uncertain";
  if (v <   0.6) return "Lean toward";
  return "Strongly for";
}

interface Props {
  value:     number;              // –1 to 1
  onChange:  (v: number) => void;
  onCommit?: (v: number) => void; // fires once on pointer/touch release
}

export default function LeanSlider({ value, onChange, onCommit }: Props) {
  function handleCommit(e: React.PointerEvent<HTMLInputElement>) {
    const v = Number(e.currentTarget.value) / 100;
    onCommit?.(v);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-mono tracking-widest text-zinc-400 uppercase">Current lean</p>
        <span className="text-xs font-mono text-zinc-300 tabular-nums whitespace-nowrap">
          {value >= 0 ? "+" : ""}{value.toFixed(2)} &mdash; {leanLabel(value)}
        </span>
      </div>
      <input
        type="range"
        min={-100}
        max={100}
        step={1}
        value={Math.round(value * 100)}
        onChange={e => onChange(Number(e.target.value) / 100)}
        onPointerUp={handleCommit}
        className="w-full accent-zinc-100"
      />
      <div className="flex justify-between text-xs text-zinc-400">
        <span>Against</span>
        <span>For</span>
      </div>
    </div>
  );
}
