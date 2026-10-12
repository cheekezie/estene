import type { ManifestStatus } from '@estene/contracts/enums';
import { Badge, type BadgeTone } from '@estene/ui/badge';

const META: Record<ManifestStatus, { tone: BadgeTone; label: string }> = {
  open: { tone: 'progress', label: 'Loading' },
  in_transit: { tone: 'info', label: 'On the road' },
  arrived: { tone: 'warning', label: 'Checking in' },
  closed: { tone: 'success', label: 'Complete' },
};

export const ManifestStatusBadge = ({ status }: { status: ManifestStatus }) => (
  <Badge tone={META[status].tone} dot>
    {META[status].label}
  </Badge>
);
