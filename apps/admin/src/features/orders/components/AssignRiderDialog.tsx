import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Paginated } from '@estene/contracts/common';
import type { RiderDto } from '@estene/contracts/rider';
import { cn } from '@estene/lib/utils';
import { Badge } from '@estene/ui/badge';
import { Button } from '@estene/ui/button';
import { Dialog, DialogContent } from '@estene/ui/dialog';
import { api } from '@/lib/api';
import { QueryState } from '@/shared/components/QueryState';
import { useAssignRider } from '../orders.queries';

/** Manual assignment fallback when auto-dispatch finds no one. Riders covering the pickup zone, online first. */
export function AssignRiderDialog({ orderId, zoneId, open, onOpenChange }: { orderId: string; zoneId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const riders = useQuery({
    queryKey: ['riders', 'for-zone', zoneId],
    queryFn: () => api.get<Paginated<RiderDto>>('/riders', { zoneId, status: 'active', limit: 100 }),
    enabled: open,
  });
  const assign = useAssignRider(orderId);

  const sorted = [...(riders.data?.items ?? [])].sort((a, b) => Number(b.isOnline) - Number(a.isOnline) || a.activeJobs - b.activeJobs);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Assign a rider" description="Active riders who cover the pickup zone.">
        <QueryState isLoading={riders.isLoading} error={riders.error} rows={3}>
          {sorted.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No active riders cover this zone.</p>
          ) : (
            <ul className="space-y-2">
              {sorted.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(r.id)}
                    className={cn('flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors', selected === r.id ? 'border-primary bg-primary-soft' : 'hover:bg-muted')}
                  >
                    <div>
                      <p className="text-sm font-medium">{r.firstName} {r.lastName} <span className="font-normal text-muted-foreground">· {r.code}</span></p>
                      <p className="text-xs text-muted-foreground">{r.activeJobs} active {r.activeJobs === 1 ? 'job' : 'jobs'} · {r.type === 'partner' ? 'Partner' : 'Company'}</p>
                    </div>
                    <Badge tone={r.isOnline ? 'success' : 'neutral'} dot>{r.isOnline ? 'Online' : 'Offline'}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!selected}
            loading={assign.isPending}
            onClick={() => selected && assign.mutate(selected, { onSuccess: () => { toast.success('Rider assigned'); onOpenChange(false); } })}
          >
            Assign rider
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
