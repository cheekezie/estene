import type { ComponentProps } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ZoneDto } from '@estene/contracts/zone';
import { cn } from '@estene/lib/utils';
import { controlClass } from '@estene/ui/input';

type Props = Omit<ComponentProps<'select'>, 'value' | 'onChange'> & {
  zones: ZoneDto[];
  zoneId?: string;
  area?: string;
  onChange: (zoneId: string, area: string) => void;
};

/** Areas grouped by zone; one pick sets both zoneId and area. Forwards id/aria from <Field>. */
export function AreaSelect({ zones, zoneId, area, onChange, className, ...rest }: Props) {
  const value = zoneId && area ? `${zoneId}|${area}` : '';
  return (
    <div className={cn('relative', className)}>
      <select
        {...rest}
        className={cn(controlClass, 'h-10 appearance-none pr-9')}
        value={value}
        onChange={(e) => {
          const [z = '', a = ''] = e.target.value.split('|');
          onChange(z, a);
        }}
      >
        <option value="">Select an area</option>
        {zones
          .filter((z) => z.isActive)
          .map((z) => (
            <optgroup key={z.id} label={`${z.name} (${z.code})`}>
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
