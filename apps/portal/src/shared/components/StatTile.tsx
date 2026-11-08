import type { LucideIcon } from 'lucide-react';
import { Card } from '@estene/ui/card';
import { cn } from '@estene/lib/utils';

export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  highlight,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  highlight?: boolean;
}) {
  return (
    <Card className={cn('p-5', highlight && 'bg-accent-soft border-amber-300')}>
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">{label}</p>
        <Icon className={cn('size-4', highlight ? 'text-amber-600' : 'text-muted-foreground')} />
      </div>
      <p className="tabular font-display mt-2 text-2xl font-bold tracking-tight">{value}</p>
      {hint && <p className="text-muted-foreground mt-1 text-xs">{hint}</p>}
    </Card>
  );
}
