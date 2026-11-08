// Word-count limits for participant free-text responses.
// Shared by client (live counter, submit gate) and server (API validation) so
// both sides always agree. Prompt limits are identical across conditions —
// a condition-specific limit would confound the timing manipulation.

export const MIN_WORDS_FINAL  = 50;
export const MIN_WORDS_PROMPT = 25;
export const MAX_WORDS_FINAL  = 400;
export const MAX_WORDS_PROMPT = 300;

/** Words = whitespace-separated tokens, ignoring empty strings. */
export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Cut text off after the `max`-th word, preserving the participant's original
 * spacing and line breaks up to that point. Returns text unchanged if within limit.
 */
export function truncateToWords(text: string, max: number): string {
  let count = 0;
  for (const match of text.matchAll(/\S+/g)) {
    count++;
    if (count === max) {
      const end = match.index + match[0].length;
      // Keep trailing whitespace only if no further word follows it.
      return /\S/.test(text.slice(end)) ? text.slice(0, end) : text;
    }
  }
  return text;
}

/** Server-side check. Returns an error message, or null if within limits. */
export function wordLimitError(text: string, min: number, max: number): string | null {
  const n = countWords(text);
  if (n < min) return `Response must be at least ${min} words (got ${n}).`;
  if (n > max) return `Response must be at most ${max} words (got ${n}).`;
  return null;
}
