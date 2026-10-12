import type { OrderEventDto } from '@estene/contracts/order';
import { ORDER_STATUS_META } from '@estene/contracts/order-status';
import { formatDateTime } from '@estene/lib/date';
import { cn, humanize } from '@estene/lib/utils';

export function OrderTimeline({ events }: { events: OrderEventDto[] }) {
  const ordered = [...events].reverse();
  return (
    <ol className="relative space-y-5">
      {ordered.map((e, i) => (
        <li key={`${e.status}-${e.at}`} className="relative flex gap-3 pl-1">
          {i < ordered.length - 1 && <span className="absolute top-5 left-[9px] h-[calc(100%+4px)] w-px bg-border" aria-hidden />}
          <span className={cn('relative mt-1 size-3 shrink-0 rounded-full ring-4 ring-card', i === 0 ? 'bg-accent' : 'bg-blue-300')} />
          <div className="min-w-0">
            <p className="text-sm font-medium">{ORDER_STATUS_META[e.status].label}</p>
            <p className="text-xs text-muted-foreground">{formatDateTime(e.at)} · by {humanize(e.actor)}</p>
            {e.note && <p className="mt-1 text-sm text-muted-foreground">{e.note}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
