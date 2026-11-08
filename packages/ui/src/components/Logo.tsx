import { cn } from '@estene/lib/utils';

/**
 * Estene mark: the round blue badge with amber speed lines and an italic "EL".
 * Brand colours are fixed (not theme tokens) so the logo looks the same everywhere.
 * Source and generated icon files: packages/theme/brand.
 */
export function LogoMark({ className, ring }: { className?: string; ring?: boolean }) {
  return (
    <svg viewBox="0 0 600 600" className={cn('size-8 shrink-0', className)} aria-hidden>
      <circle cx="300" cy="300" r="300" fill="#3230aa" />
      {ring && <circle cx="300" cy="300" r="285" fill="none" stroke="#fff" strokeWidth="30" />}
      <g fill="#fbd23a">
        <polygon points="176,184 284,184 276,216 152,216" />
        <polygon points="112,276 264,276 256,306 88,306" />
        <polygon points="48,360 346,360 342,392 24,392" />
      </g>
      <g fill="#fff">
        <polygon points="328,108 462,108 450,138 326,138" />
        <polygon points="332,138 376,138 336,318 292,318" />
        <polygon points="326,186 440,186 430,214 318,214" />
        <polygon points="426,230 478,230 462,290 410,290" />
        <polygon points="292,288 462,288 456,318 292,318" />
        <polygon points="414,318 458,318 434,412 390,412" />
        <polygon points="392,412 510,412 514,398 526,398 514,442 388,442" />
      </g>
    </svg>
  );
}

export function Logo({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      {/* On dark backgrounds a white ring keeps the blue badge from blending in. */}
      <LogoMark ring={inverted} />
      <span
        className={cn(
          'font-display text-lg font-extrabold tracking-tight',
          inverted ? 'text-white' : 'text-blue-950 dark:text-white',
        )}
      >
        estene
      </span>
    </span>
  );
}
