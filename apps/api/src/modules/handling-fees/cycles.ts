/**
 * Billing cycles run monthly from the activation date, on Lagos calendar days
 * (UTC+1 all year). Activated 8 Nov → cycle 1 is 8 Nov 00:00 to 8 Dec 00:00.
 * An anchor on the 29th–31st falls back to the last day of shorter months
 * (31 Jan → 28 Feb → 31 Mar), so every cycle is one calendar month.
 */
const WAT_OFFSET_MS = 60 * 60 * 1000;

function lagosDate(d: Date) {
  const local = new Date(d.getTime() + WAT_OFFSET_MS);
  return { y: local.getUTCFullYear(), m: local.getUTCMonth(), d: local.getUTCDate() };
}

/** Lagos midnight on `day` of month `m` (may overflow into later years), clamped to the month's length. */
function lagosMidnight(y: number, m: number, day: number) {
  const first = new Date(Date.UTC(y, m, 1));
  const year = first.getUTCFullYear();
  const month = first.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, daysInMonth)) - WAT_OFFSET_MS);
}

/** Cycle `n` (1 = the first) as [start, end). */
export function cycleBounds(anchor: Date, n: number) {
  const a = lagosDate(anchor);
  return {
    start: lagosMidnight(a.y, a.m + n - 1, a.d),
    end: lagosMidnight(a.y, a.m + n, a.d),
  };
}

/** The cycle running at `at`, or 0 before the anchor. */
export function cycleAt(anchor: Date, at: Date) {
  if (at < cycleBounds(anchor, 1).start) return 0;
  const a = lagosDate(anchor);
  const t = lagosDate(at);
  let n = (t.y - a.y) * 12 + (t.m - a.m) + 1;
  if (cycleBounds(anchor, n).start > at) n -= 1;
  return n;
}

export const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);
