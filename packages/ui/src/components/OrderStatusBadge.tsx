import type { OrderStatus } from '@estene/contracts/enums';
import { ORDER_STATUS_META } from '@estene/contracts/order-status';
import { Badge } from '../ui/badge';

export function OrderStatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const meta = ORDER_STATUS_META[status];
  return (
    <Badge tone={meta.tone} dot className={className}>
      {meta.label}
    </Badge>
  );
}
