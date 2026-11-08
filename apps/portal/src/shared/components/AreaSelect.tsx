import type { ComponentProps } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@estene/lib/utils';
import { controlClass } from '@estene/ui/input';
import type { PublicZone } from '@/features/orders/orders.queries';

type Props = Omit<ComponentProps<'select'>, 'value' | 'onChange'> & {
  zones: PublicZone[];
  zoneId?: string;
  area?: string;
  onChange: (zoneId: string, area: string) => void;
};

/** Areas grouped by zone; one pick sets both zoneId and area. Forwards id/aria from <Field>. */
export function AreaSelect({ zones, zoneId, area, onChange, className, ...rest }: Props) {
  return (
    <div className={cn('relative', className)}>
      <select
        {...rest}
        className={cn(controlClass, 'h-10 appearance-none pr-9')}
        value={zoneId && area ? `${zoneId}|${area}` : ''}
        onChange={(e) => {
          const [z = '', a = ''] = e.target.value.split('|');
          onChange(z, a);
        }}
      >
        <option value="">Select an area</option>
        {zones.map((z) => (
          <optgroup key={z.id} label={z.name}>
            {z.areas.map((a) => (
              <option key={a} value={`${z.id}|${a}`}>
                {a}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <ChevronDown className="text-muted-foreground pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2" />
    </div>
  );
}
