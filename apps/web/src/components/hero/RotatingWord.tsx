/**
 * Cycles four words in place: they share one grid cell (sized to the longest
 * word, so the line never reflows) and take turns fading up and out. No
 * overflow clipping, so descenders and neighbours can't be cut or peek in.
 * CSS only — see `.word-cycle` in globals.css (built for exactly four words).
 */
export function RotatingWord({ words }: { words: [string, string, string, string] }) {
  return (
    <span className="inline-grid align-baseline">
      <span className="sr-only">{words.join(', ')}</span>
      {words.map((w, i) => (
        <span
          key={w}
          aria-hidden
          className="word-cycle col-start-1 row-start-1 text-amber-400"
          style={{ animationDelay: `${i * 2.5}s` }}
        >
          {w}
        </span>
      ))}
    </span>
  );
}
