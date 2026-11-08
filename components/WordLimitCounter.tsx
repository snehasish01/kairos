// Neutral helper line + live word counter shown under every limited free-text input.
// Used for both the dissonance prompt (all conditions) and the final rationale so the
// presentation is identical wherever a limit applies.

interface Props {
  count: number;
  min:   number;
  max:   number;
}

export default function WordLimitCounter({ count, min, max }: Props) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-zinc-500 leading-relaxed">
        Please write at least {min} words so we can understand your reasoning.
      </p>
      <p className="text-xs font-mono text-zinc-500" aria-live="polite">
        {count < min
          ? `${count} / ${min} words minimum`
          : `${count} / ${max} words maximum`}
      </p>
    </div>
  );
}
