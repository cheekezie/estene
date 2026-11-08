import type { ComponentProps } from 'react';
import { cn } from '@estene/lib/utils';

export const controlClass =
  'w-full rounded-md border border-input bg-card px-3 text-base text-foreground sm:text-sm shadow-xs transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-destructive/20';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(controlClass, 'h-10', className)} {...props} />;
}
