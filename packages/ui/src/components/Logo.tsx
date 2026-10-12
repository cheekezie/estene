import { cn } from '@estene/lib/utils';

/** Estene mark: a blue tile with an "E" whose middle stroke is an amber route line in motion. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8', className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--color-blue-600)" />
      <rect x="9" y="8" width="13" height="3.2" rx="1.6" fill="#fff" />
      <rect x="9" y="14.4" width="16" height="3.2" rx="1.6" fill="var(--color-amber-400)" />
      <rect x="9" y="20.8" width="13" height="3.2" rx="1.6" fill="#fff" />
      <rect x="9" y="8" width="3.2" height="16" rx="1.6" fill="#fff" />
    </svg>
  );
}

export function Logo({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark />
      <span className={cn('font-display text-lg font-extrabold tracking-tight', inverted ? 'text-white' : 'text-blue-950 dark:text-white')}>
        estene
      </span>
    </span>
  );
}
