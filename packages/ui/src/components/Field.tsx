import { useId, type ReactElement, type ReactNode } from 'react';
import { cloneElement } from 'react';
import { cn } from '@estene/lib/utils';
import { Label } from '../ui/label';

type FieldProps = {
  label: string;
  error?: string;
  hint?: ReactNode;
  className?: string;
  /** A single control (Input, Select, Textarea…) — it receives id + aria wiring. */
  children: ReactElement<Record<string, unknown>>;
};

/** Label + control + hint/error, with ids and aria attributes wired up. */
export function Field({ label, error, hint, className, children }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {cloneElement(children, { id, 'aria-invalid': !!error || undefined, 'aria-describedby': describedBy })}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
