import { z } from 'zod';

/**
 * Warehousing handling fee. Each warehousing client is billed in monthly
 * cycles that start on its activation date (activated 8 Nov → 8 Nov–7 Dec,
 * 8 Dec–7 Jan, …). A cycle's units are what was on our shelves when it
 * started plus every unit added during it; units shipped mid-cycle still
 * count. The fee is a price per block of units, rounded up, and a cycle
 * with no units costs nothing. Ops can make cycles free in advance and
 * waive a cycle that has been billed.
 */

export const HANDLING_FEE_STATUSES = ['due', 'paid', 'waived', 'free', 'no_stock'] as const;
export type HandlingFeeStatus = (typeof HANDLING_FEE_STATUSES)[number];

export const HANDLING_FEE_STATUS_META: Record<
  HandlingFeeStatus,
  { label: string; tone: 'warning' | 'success' | 'neutral' | 'info' }
> = {
  due: { label: 'Due', tone: 'warning' },
  paid: { label: 'Paid', tone: 'success' },
  waived: { label: 'Waived', tone: 'neutral' },
  free: { label: 'Free', tone: 'info' },
  no_stock: { label: 'No stock', tone: 'neutral' },
};

/** Platform defaults; ops change them on the Pricing page. */
export const DEFAULT_HANDLING_FEE = {
  handlingUnitsPerBlock: 20,
  /** Kobo per block (₦5,000). */
  handlingFeePerBlock: 500_000,
  /** Days after a cycle ends before its fee is due. */
  handlingFeeDueDays: 7,
} as const;

export const HandlingFeeSettingsSchema = z.object({
  handlingUnitsPerBlock: z.number().int().min(1).max(100_000),
  handlingFeePerBlock: z.number().int().nonnegative(),
  handlingFeeDueDays: z.number().int().min(0).max(90),
});
export type HandlingFeeSettings = z.infer<typeof HandlingFeeSettingsSchema>;

/** A cycle's `periodEnd` is exclusive; this is its last day, for display ("8 Nov – 7 Dec"). */
export const cycleLastDay = (periodEnd: string | Date) =>
  new Date(new Date(periodEnd).getTime() - 1);

/** 1–20 units = 1 block, 21–40 = 2 blocks, … */
export function handlingFeeFor(units: number, unitsPerBlock: number, pricePerBlock: number) {
  const blocks = units > 0 ? Math.ceil(units / unitsPerBlock) : 0;
  return { blocks, amount: blocks * pricePerBlock };
}

// ── Admin actions ───────────────────────────────────────────────────────────

export const HandlingFeeWaiveSchema = z.object({
  reason: z.string().trim().min(3, 'Give a reason').max(300),
});

export const HandlingFeeRecordPaymentSchema = z.object({
  reference: z.string().trim().max(100).optional(),
  note: z.string().trim().max(300).optional(),
});

/** Make cycles free in advance: `cycles` cycles starting at cycle number `fromCycle` (1 = first). */
export const FreePeriodInputSchema = z.object({
  fromCycle: z.number().int().min(1),
  cycles: z.number().int().min(1).max(36),
  reason: z.string().trim().min(3, 'Give a reason').max(300),
});
export type FreePeriodInput = z.infer<typeof FreePeriodInputSchema>;

// ── Views ───────────────────────────────────────────────────────────────────

export type HandlingFeeDto = {
  id: string;
  reference: string;
  /** 1 = the cycle that starts on the activation date. */
  cycle: number;
  periodStart: string;
  /** Exclusive: the next cycle starts at this instant. */
  periodEnd: string;
  units: { carriedIn: number; added: number; billed: number };
  unitsPerBlock: number;
  pricePerBlock: number;
  blocks: number;
  /** What the cycle costs, kobo; 0 for free and no-stock cycles. */
  amount: number;
  /** What it would have cost — shown on free and waived cycles. */
  listAmount: number;
  status: HandlingFeeStatus;
  dueAt: string | null;
  overdue: boolean;
  paidAt: string | null;
  note: string | null;
  createdAt: string;
};

/** The cycle running now, priced on the units so far. */
export type HandlingFeeEstimateDto = {
  cycle: number;
  periodStart: string;
  periodEnd: string;
  units: { carriedIn: number; added: number; billed: number };
  blocks: number;
  amount: number;
  free: boolean;
};

export type FreePeriodDto = {
  id: string;
  fromCycle: number;
  toCycle: number;
  reason: string;
  createdBy: string | null;
  createdAt: string;
};

export type HandlingFeesViewDto = {
  settings: HandlingFeeSettings;
  /** Null until warehousing has been switched on. */
  activatedAt: string | null;
  current: HandlingFeeEstimateDto | null;
  totalDue: number;
  nextDueAt: string | null;
  fees: HandlingFeeDto[];
};

/** Admin view adds free periods and the next cycles to choose from. */
export type AdminHandlingFeesViewDto = HandlingFeesViewDto & {
  freePeriods: FreePeriodDto[];
  upcoming: { cycle: number; periodStart: string; periodEnd: string; free: boolean }[];
};
