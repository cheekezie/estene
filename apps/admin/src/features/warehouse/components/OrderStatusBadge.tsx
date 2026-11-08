import { ORDER_STATUS_META, type OrderStatus } from '@estene/contracts/warehouse';
import { Badge, type BadgeTone } from '@estene/ui/badge';

const TONE: Record<(typeof ORDER_STATUS_META)[OrderStatus]['tone'], BadgeTone> = {
  neutral: 'neutral',
  info: 'info',
  warning: 'warning',
  success: 'success',
  danger: 'error',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const meta = ORDER_STATUS_META[status];
  return (
    <Badge tone={TONE[meta.tone]} dot>
      {meta.label}
    </Badge>
  );
}
