/**
 * Straight-line depreciation.
 *
 * Deliberately a pure function over plain numbers, in `utils` rather than in
 * the agent's folder: the register posts with it, the statement of assets and
 * liabilities values with it, and a figure that two of those disagreed on would
 * be a reconciliation failure nobody could explain. The agent gets no say in
 * the arithmetic — it can only ask for a period to be posted.
 */

/** The columns depreciation needs. Anything wider is the caller's business. */
export interface DepreciableAsset {
  purchaseCost: number | null;
  purchaseDate: string | null; // YYYY-MM-DD
  salvageValue: number | null;
  usefulLifeMonths: number | null;
  accumulatedDepreciation: number | null;
  disposedAt: string | null; // YYYY-MM-DD
  depreciationMethod?: string | null;
  assetClass?: string | null;
}

/** Money, to the cent. Cumulative rounding error becomes an unbalanced journal. */
const money = (n: number) => Math.round(n * 100) / 100;

/**
 * Stationery is consumed, not capitalised: it is expensed when bought, so it
 * carries no written-down value and must never appear in a depreciation run.
 */
export const isDepreciable = (a: DepreciableAsset): boolean =>
  (a.depreciationMethod ?? 'straight_line') === 'straight_line' &&
  (a.assetClass ?? 'other') !== 'stationery' &&
  !!a.purchaseCost &&
  a.purchaseCost > 0 &&
  !!a.usefulLifeMonths &&
  a.usefulLifeMonths > 0 &&
  !!a.purchaseDate;

/** The full amount that will ever be charged: cost less what it is worth at the end. */
export const depreciableBase = (a: DepreciableAsset): number =>
  money(Math.max(0, (a.purchaseCost ?? 0) - (a.salvageValue ?? 0)));

export const monthlyCharge = (a: DepreciableAsset): number =>
  isDepreciable(a) ? money(depreciableBase(a) / (a.usefulLifeMonths as number)) : 0;

/** Whole months from `from` to `to`, never negative. Day-of-month is ignored. */
function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  if (!fy || !fm || !ty || !tm) return 0;
  return Math.max(0, (ty - fy) * 12 + (tm - fm));
}

export interface DepreciationState {
  /** Months charged from purchase to `asOf`, capped at the useful life. */
  monthsCharged: number;
  monthlyCharge: number;
  /** What should have accumulated by `asOf`, never more than the base. */
  accumulated: number;
  /** Cost less accumulated depreciation — the figure the statement carries. */
  writtenDownValue: number;
  fullyDepreciated: boolean;
  disposed: boolean;
}

/**
 * What the asset should look like at a date.
 *
 * Charged from the month *after* purchase, the common convention for a monthly
 * run, and stopped at disposal — a thing sold in March cannot depreciate in
 * April.
 */
export function depreciationAsOf(a: DepreciableAsset, asOf: string): DepreciationState {
  const cost = a.purchaseCost ?? 0;
  const disposed = !!a.disposedAt && a.disposedAt <= asOf;

  if (!isDepreciable(a)) {
    return {
      monthsCharged: 0,
      monthlyCharge: 0,
      accumulated: money(a.accumulatedDepreciation ?? 0),
      writtenDownValue: money(cost - (a.accumulatedDepreciation ?? 0)),
      fullyDepreciated: false,
      disposed,
    };
  }

  const stopAt = disposed ? (a.disposedAt as string) : asOf;
  const life = a.usefulLifeMonths as number;
  const months = Math.min(monthsBetween(a.purchaseDate as string, stopAt), life);
  const per = monthlyCharge(a);
  // The last month takes the rounding, so the total is exactly the base rather
  // than the base ± a few cents times the life.
  const accumulated = months >= life ? depreciableBase(a) : money(per * months);

  return {
    monthsCharged: months,
    monthlyCharge: per,
    accumulated,
    writtenDownValue: money(cost - accumulated),
    fullyDepreciated: months >= life,
    disposed,
  };
}

/**
 * What to charge for one month, given what has already been posted.
 *
 * `period` is YYYY-MM. Returns 0 rather than throwing when there is nothing to
 * charge — not yet in service, already fully depreciated, disposed, or the
 * period has been posted before. A depreciation run over a mixed register
 * should skip those quietly, not fail.
 */
export function chargeForPeriod(
  a: DepreciableAsset & { lastDepreciationPeriod?: string | null },
  period: string,
): number {
  if (!isDepreciable(a)) return 0;
  if (a.lastDepreciationPeriod && a.lastDepreciationPeriod >= period) return 0;

  const periodEnd = `${period}-28`; // any day in the month; only YYYY-MM is read
  if (a.disposedAt && a.disposedAt.slice(0, 7) < period) return 0;
  if ((a.purchaseDate as string).slice(0, 7) >= period) return 0;

  const already = money(a.accumulatedDepreciation ?? 0);
  const target = depreciationAsOf(a, periodEnd).accumulated;
  return money(Math.max(0, target - already));
}
