/**
 * Cycles three or four words in place: they share one grid cell (sized to the longest
 * word, so the line never reflows) and take turns fading up and out. No overflow
 * clipping, so descenders and neighbours can't be cut or peek in.
 * CSS only — see `.word-cycle` / `.word-cycle-3` in globals.css.
 *
 * `interval` is how long each word stays (seconds). `offset` shifts the whole cycle
 * earlier, so two rotators on one headline can change at different moments.
 */
export function RotatingWord({
  words,
  interval = 2.5,
  offset = 0,
}: {
  words: [string, string, string] | [string, string, string, string];
  interval?: number;
  offset?: number;
}) {
  const cycle = words.length === 3 ? 'word-cycle-3' : 'word-cycle';
  return (
    <span className="inline-grid align-baseline">
      <span className="sr-only">{words.join(', ')}</span>
      {words.map((w, i) => (
        <span
          key={w}
          aria-hidden
          className={`${cycle} col-start-1 row-start-1 text-amber-400`}
          style={{
            animationDuration: `${words.length * interval}s`,
            animationDelay: `${i * interval - offset}s`,
          }}
        >
          {w}
        </span>
      ))}
    </span>
  );
}
