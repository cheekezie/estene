/** Lagos is UTC+1 all year; months are billed on local calendar boundaries. */
const WAT_OFFSET_MS = 60 * 60 * 1000;

/** `YYYY-MM` of the month before `now`, in Lagos time. */
export function previousMonth(now = new Date()) {
  const local = new Date(now.getTime() + WAT_OFFSET_MS);
  const d = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** [start, end) of a `YYYY-MM` month as UTC instants. */
export function monthBounds(month: string) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return {
    start: new Date(Date.UTC(y, m - 1, 1) - WAT_OFFSET_MS),
    end: new Date(Date.UTC(y, m, 1) - WAT_OFFSET_MS),
  };
}
