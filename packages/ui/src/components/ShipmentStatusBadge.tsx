import type { ShipmentStatus } from '@estene/contracts/enums';
import { SHIPMENT_STATUS_META } from '@estene/contracts/shipment-status';
import { Badge } from '../ui/badge';

export function ShipmentStatusBadge({
  status,
  className,
}: {
  status: ShipmentStatus;
  className?: string;
}) {
  const meta = SHIPMENT_STATUS_META[status];
  return (
    <Badge tone={meta.tone} dot className={className}>
      {meta.label}
    </Badge>
  );
}
