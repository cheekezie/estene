import type { ShipmentEventDto } from '@estene/contracts/shipment';
import { SHIPMENT_STATUS_META } from '@estene/contracts/shipment-status';
import { formatDateTime } from '@estene/lib/date';
import { cn, humanize } from '@estene/lib/utils';

export function ShipmentTimeline({ events }: { events: ShipmentEventDto[] }) {
  const ordered = [...events].reverse();
  return (
    <ol className="relative space-y-5">
      {ordered.map((e, i) => (
        <li key={`${e.status}-${e.at}`} className="relative flex gap-3 pl-1">
          {i < ordered.length - 1 && (
            <span
              className="bg-border absolute left-[9px] top-5 h-[calc(100%+4px)] w-px"
              aria-hidden
            />
          )}
          <span
            className={cn(
              'ring-card relative mt-1 size-3 shrink-0 rounded-full ring-4',
              i === 0 ? 'bg-accent' : 'bg-blue-300',
            )}
          />
          <div className="min-w-0">
            <p className="text-sm font-medium">{SHIPMENT_STATUS_META[e.status].label}</p>
            <p className="text-muted-foreground text-xs">
              {formatDateTime(e.at)} · by {humanize(e.actor)}
            </p>
            {e.note && <p className="text-muted-foreground mt-1 text-sm">{e.note}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
