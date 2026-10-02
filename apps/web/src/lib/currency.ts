import { useEffect, useState } from 'react';
import { API, authHeaders } from './auth';

/**
 * What a currency's symbol is, and which one the company's own money is in.
 *
 * Every amount in this app used to render a hardcoded `$`. `accounts.currency` has
 * always been stored and was simply never read, so on a database whose accounts are
 * all PKR, every figure on every screen was labelled in the wrong currency — and the
 * Accounts table showed `$` in one column and `PKR` in the next.
 *
 * Two questions, and keeping them apart is what makes this usable:
 *
 *   symbolFor(code)  for a record that NAMES a currency — an account.
 *   base             for one that does not, which is almost everything: a
 *                    transaction, an invoice, a payslip, an asset's purchase cost.
 *                    `currencies.is_base` says which, so it is operator-configurable
 *                    rather than a constant somebody has to come back and change.
 *
 * The catalogue is fetched once per page load and shared, because a dozen components
 * want it and it changes about once a year. `/api/currencies` is readable by anyone
 * signed in for exactly this reason — behind `finance/accounts` it was unreachable
 * from the HR and Acquisition screens that need it most.
 */

export interface Currency {
  id: string;
  code: string;
  name: string | null;
  symbol: string | null;
  isActive: boolean;
  isBase: boolean;
}

/**
 * Module-level, not per-component. Twelve components mounting at once would
 * otherwise be twelve identical requests, and `inflight` is what collapses the
 * concurrent ones rather than only the sequential ones.
 */
let cache: Currency[] | null = null;
let inflight: Promise<Currency[]> | null = null;

function load(): Promise<Currency[]> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = fetch(`${API}/currencies`, { headers: authHeaders() })
    .then((r) => (r.ok ? r.json() : { data: [] }))
    .then((b) => {
      cache = ((b?.data as Currency[]) || []).map((c) => ({ ...c, isActive: c.isActive !== false, isBase: !!c.isBase }));
      return cache;
    })
    .catch(() => {
      // A failure must not leave every amount blank. Nothing is cached, so the next
      // mount tries again, and until then figures render as bare numbers — which is
      // wrong-looking but not misleading, unlike a symbol we guessed.
      inflight = null;
      return [];
    });
  return inflight;
}

/**
 * Every mounted `useCurrencies`, so an invalidation reaches the components that are
 * already on screen.
 *
 * Clearing the cache alone is not enough: the hook reads it once on mount, so adding
 * a currency would leave it missing from the very dropdown that created it until the
 * page was reloaded. A tiny subscriber list is the whole mechanism — this is one
 * rarely-changing list, not a reason for a state library.
 */
const listeners = new Set<(rows: Currency[]) => void>();

/** Clears the shared cache and re-reads it, for when a currency is added or the base changes. */
export function invalidateCurrencies(): void {
  cache = null;
  inflight = null;
  if (listeners.size === 0) return;
  load().then((rows) => listeners.forEach((fn) => fn(rows)));
}

export interface MoneyOptions {
  /** Force a fixed number of decimal places. Payroll wants 2; a grid usually wants none. */
  decimals?: number;
}

/**
 * Formats without the hook, for the places that cannot use one — `HRReports` builds
 * a print document as an HTML string, outside React.
 */
export function formatMoney(value: unknown, symbol: string, opts: MoneyOptions = {}): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const digits = opts.decimals;
  const body = n.toLocaleString(undefined,
    digits === undefined ? {} : { minimumFractionDigits: digits, maximumFractionDigits: digits });
  // A space, always. "Rs1,234" reads as one token and "₨1,234" is not what anybody
  // writes; `$ 1,234` is marginally unusual and the consistency is worth more than
  // the convention for one symbol.
  return symbol ? `${symbol} ${body}` : body;
}

export function useCurrencies() {
  const [currencies, setCurrencies] = useState<Currency[]>(cache ?? []);
  const [loaded, setLoaded] = useState(cache !== null);

  useEffect(() => {
    let cancelled = false;
    const apply = (rows: Currency[]) => {
      if (cancelled) return;
      setCurrencies(rows);
      setLoaded(true);
    };
    load().then(apply);
    listeners.add(apply);
    return () => {
      cancelled = true;
      listeners.delete(apply);
    };
  }, []);

  const base = currencies.find((c) => c.isBase) ?? null;

  /**
   * The symbol for a code, or the base's when none is named.
   *
   * Falls back to the CODE rather than to a symbol: a currency added without one
   * should read `AED 5,000`, which is correct, instead of borrowing whatever symbol
   * happens to be lying around. Empty while the catalogue is still loading, so a
   * figure appears briefly unlabelled rather than briefly wrong.
   */
  const symbolFor = (code?: string | null): string => {
    const wanted = (code || base?.code || '').toUpperCase();
    if (!wanted) return '';
    const match = currencies.find((c) => c.code.toUpperCase() === wanted);
    return match?.symbol || wanted;
  };

  const money = (value: unknown, code?: string | null, opts?: MoneyOptions): string =>
    formatMoney(value, symbolFor(code), opts);

  return { currencies, loaded, base, baseCode: base?.code ?? '', symbolFor, money };
}
