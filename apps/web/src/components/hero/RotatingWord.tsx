/**
 * Cycles through words with a vertical slide — CSS only. The first word is
 * repeated at the end so the loop wraps seamlessly. Screen readers get one
 * stable phrase via the sr-only span.
 */
/** Exactly four words — the easing curve in globals.css (`.word-roller`) is built for four stops. */
export function RotatingWord({ words }: { words: [string, string, string, string] }) {
  const loop = [...words, words[0]];
  return (
    <span className="relative inline-flex h-[1.15em] overflow-hidden align-top">
      <span className="sr-only">{words.join(', ')}</span>
      <span aria-hidden className="word-roller flex flex-col">
        {loop.map((w, i) => (
          <span key={i} className="block h-[1.15em] leading-[1.15em] text-amber-400">
            {w}
          </span>
        ))}
      </span>
    </span>
  );
}
