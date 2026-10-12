import { Package } from 'lucide-react';

/** Endless strip of places we deliver — duplicated once so the -50% translate loops cleanly. */
export function AreaTicker({ areas }: { areas: string[] }) {
  const items = [...areas, ...areas];
  return (
    <div
      className="relative overflow-hidden border-y border-white/10 bg-blue-950 py-4"
      aria-label={`We deliver to ${areas.join(', ')}`}
    >
      <div className="ticker flex w-max gap-10 whitespace-nowrap" aria-hidden>
        {items.map((a, i) => (
          <span
            key={i}
            className="font-display inline-flex items-center gap-3 text-lg font-bold text-blue-100/80"
          >
            <Package className="size-4 text-amber-400" />
            {a}
          </span>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-blue-950" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-blue-950" />
    </div>
  );
}
