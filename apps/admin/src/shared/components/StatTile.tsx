import type { LucideIcon } from 'lucide-react';
import { Card } from '@estene/ui/card';
import { cn } from '@estene/lib/utils';

export function StatTile({ label, value, hint, icon: Icon, highlight }: { label: string; value: string | number; hint?: string; icon: LucideIcon; highlight?: boolean }) {
  return (
    <Card className={cn('p-5', highlight && 'border-amber-300 bg-accent-soft')}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className={cn('size-4', highlight ? 'text-amber-600' : 'text-muted-foreground')} />
      </div>
      <p className="tabular mt-2 font-display text-2xl font-bold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}
