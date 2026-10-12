import type { ComponentProps } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@estene/lib/utils';
import { controlClass } from './input';

export type SelectOption = { value: string; label: string };

/** Native select — accessible, mobile-friendly and form-library agnostic. */
export function Select({
  className,
  options,
  placeholder,
  ...props
}: ComponentProps<'select'> & { options: SelectOption[]; placeholder?: string }) {
  return (
    <div className={cn('relative', className)}>
      <select className={cn(controlClass, 'h-10 appearance-none pr-9')} {...props}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
