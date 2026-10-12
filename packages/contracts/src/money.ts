/**
 * All money is stored and transmitted as integer kobo (₦1 = 100 kobo) so
 * arithmetic never touches floating point. Convert only at the UI edge.
 */
export type Kobo = number;

export const nairaToKobo = (naira: number): Kobo => Math.round(naira * 100);
export const koboToNaira = (kobo: Kobo): number => kobo / 100;

/** Rounds up to the nearest `step` naira (default ₦50) — keeps quoted prices tidy. */
export const roundUpKobo = (kobo: Kobo, stepNaira = 50): Kobo => {
  const step = stepNaira * 100;
  return Math.ceil(kobo / step) * step;
};

export const formatNaira = (kobo: Kobo, opts: { decimals?: boolean } = {}): string =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: opts.decimals ? 2 : 0,
    maximumFractionDigits: opts.decimals ? 2 : 0,
  }).format(koboToNaira(kobo));
