import type { ComponentProps } from 'react';
import { cn } from '@estene/lib/utils';

export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full text-left text-sm', className)} {...props} />
    </div>
  );
}
export const THead = ({ className, ...p }: ComponentProps<'thead'>) => (
  <thead className={cn('border-b bg-muted/60 text-xs font-medium text-muted-foreground', className)} {...p} />
);
export const TBody = ({ className, ...p }: ComponentProps<'tbody'>) => <tbody className={cn('divide-y', className)} {...p} />;
export const TR = ({ className, ...p }: ComponentProps<'tr'>) => <tr className={cn('transition-colors', className)} {...p} />;
export const TH = ({ className, ...p }: ComponentProps<'th'>) => <th className={cn('px-4 py-2.5 font-medium whitespace-nowrap', className)} {...p} />;
export const TD = ({ className, ...p }: ComponentProps<'td'>) => <td className={cn('px-4 py-3 align-middle', className)} {...p} />;
