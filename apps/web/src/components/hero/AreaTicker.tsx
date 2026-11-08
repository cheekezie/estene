import { MapPin, Package, Plane } from 'lucide-react';

/** area = an Abuja neighbourhood; city = a city we serve (Abuja, Lagos…); nationwide = "Across Nigeria". */
export type TickerItem = { label: string; kind?: 'area' | 'city' | 'nationwide' };

const ICON = { area: Package, city: MapPin, nationwide: Plane } as const;

/**
 * Endless strip of places we deliver — duplicated once so the -50% translate loops cleanly.
 * Areas use the parcel icon; cities and "Across Nigeria" get their own icon and a brighter label.
 */
export function AreaTicker({ items }: { items: TickerItem[] }) {
  const loop = [...items, ...items];
  return (
    <div
      className="relative overflow-hidden border-y border-white/10 bg-blue-950 py-4"
      aria-label={`We deliver to ${items.map((i) => i.label).join(', ')}`}
    >
      <div className="ticker flex w-max gap-10 whitespace-nowrap" aria-hidden>
        {loop.map((item, i) => {
          const kind = item.kind ?? 'area';
          const Icon = ICON[kind];
          return (
            <span
              key={i}
              className={`font-display inline-flex items-center gap-3 text-lg font-bold ${kind === 'area' ? 'text-blue-100/80' : 'text-white'}`}
            >
              <Icon className="size-4 text-amber-400" />
              {item.label}
            </span>
          );
        })}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-blue-950" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-blue-950" />
    </div>
  );
}
