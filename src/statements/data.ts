import { getDb, schema } from '@ganova/database';
import { Env } from '../index';
import { depreciationAsOf, type DepreciableAsset } from '../utils/depreciation';

/**
 * The figures behind a statement, read straight from the ledger.
 *
 * Deliberately outside `src/agents/`: a statement has to be reproducible
 * without a model. The agent may ask for one, but nothing it says reaches these
 * numbers — they come from `general_journals` and the asset register, and from
 * nowhere else.
 */

/**
 * A journal's lines, compound or legacy.
 *
 * The same reader `src/routes/finance.ts` uses: entries written before compound
 * journals existed carry a single debit account, a single credit account and an
 * amount, and they are still in the ledger. Reading only `lines` would silently
 * omit them and quietly understate every total.
 */
export function journalLines(journal: any): { accountId: string; type: string; amount: number }[] {
  if (journal.lines) {
    try {
      const parsed = typeof journal.lines === 'string' ? JSON.parse(journal.lines) : journal.lines;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [
    { accountId: journal.debitAccountId, type: 'debit', amount: journal.amount || 0 },
    { accountId: journal.creditAccountId, type: 'credit', amount: journal.amount || 0 },
  ].filter((l) => l.accountId);
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * `account_type` normalised.
 *
 * The column is nullable, the UI writes it lowercase and the agent's tool
 * describes it capitalised, so the same kind of account arrives spelled three
 * ways. An unclassified account is reported as `unclassified` rather than being
 * dropped: an account missing from a statement is far worse than one that
 * appears under a heading asking to be classified.
 */
export function normaliseType(t: string | null | undefined): string {
  const s = (t || '').trim().toLowerCase();
  if (!s) return 'unclassified';
  if (s.startsWith('rev') || s === 'income' || s === 'sales') return 'revenue';
  if (s.startsWith('exp') || s === 'cost' || s === 'cogs') return 'expense';
  if (s.startsWith('asset') || s === 'bank' || s === 'cash') return 'asset';
  if (s.startsWith('liab') || s === 'payable' || s === 'loan') return 'liability';
  if (s.startsWith('eq') || s === 'capital') return 'equity';
  return 'unclassified';
}

export interface AccountMovement {
  accountId: string;
  accountName: string;
  accountType: string;
  debits: number;
  credits: number;
  /** Debits less credits. Positive is a debit balance. */
  net: number;
}

interface LedgerSnapshot {
  accounts: any[];
  journals: any[];
}

async function readLedger(env: Env): Promise<LedgerSnapshot> {
  const db = getDb(env);
  const [accounts, journals] = await Promise.all([
    db.query.accounts.findMany(),
    db.query.generalJournals.findMany(),
  ]);
  return { accounts, journals };
}

/**
 * Movement on every account between two dates.
 *
 * A *period delta*, not a running total — the pattern from `GET /accounts`
 * rather than from `/trial-balance`, which is cumulative-to-date and cannot
 * express "March" at all. A profit and loss account for a period that silently
 * included every prior year would be wrong in a way that looks plausible.
 */
export function movementsBetween(
  snapshot: LedgerSnapshot,
  startDate: string,
  endDate: string,
): AccountMovement[] {
  const byAccount = new Map<string, { debits: number; credits: number }>();

  for (const j of snapshot.journals) {
    if (!j.entryDate || j.entryDate < startDate || j.entryDate > endDate) continue;
    for (const line of journalLines(j)) {
      if (!line.accountId) continue;
      const cur = byAccount.get(line.accountId) ?? { debits: 0, credits: 0 };
      if (line.type === 'debit') cur.debits += line.amount || 0;
      else if (line.type === 'credit') cur.credits += line.amount || 0;
      byAccount.set(line.accountId, cur);
    }
  }

  return snapshot.accounts.map((acc) => {
    const m = byAccount.get(acc.id) ?? { debits: 0, credits: 0 };
    return {
      accountId: acc.id,
      accountName: acc.accountName,
      accountType: normaliseType(acc.accountType),
      debits: round(m.debits),
      credits: round(m.credits),
      net: round(m.debits - m.credits),
    };
  });
}

/** Cumulative balance on every account up to and including a date. */
export function balancesAsOf(snapshot: LedgerSnapshot, asOf: string): AccountMovement[] {
  return movementsBetween(snapshot, '0000-01-01', asOf);
}

export interface StatementLine {
  label: string;
  amount: number;
}

export interface ProfitAndLoss {
  startDate: string;
  endDate: string;
  revenue: StatementLine[];
  expenses: StatementLine[];
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  unclassified: StatementLine[];
  /** True when nothing at all was posted in the period. Say so; do not print zeros as if they were measured. */
  empty: boolean;
}

/**
 * Profit and loss for a period.
 *
 * Revenue accounts carry credit balances and expense accounts debit balances,
 * so revenue is credits less debits and expenses the reverse. Both are reported
 * as positive figures — a negative expense line means the account was refunded
 * more than it was charged, which is worth seeing rather than hiding.
 */
export async function profitAndLoss(
  env: Env,
  startDate: string,
  endDate: string,
): Promise<ProfitAndLoss> {
  const snapshot = await readLedger(env);
  const movements = movementsBetween(snapshot, startDate, endDate);
  const moved = movements.filter((m) => m.debits !== 0 || m.credits !== 0);

  const revenue = moved
    .filter((m) => m.accountType === 'revenue')
    .map((m) => ({ label: m.accountName, amount: round(-m.net) }));
  const expenses = moved
    .filter((m) => m.accountType === 'expense')
    .map((m) => ({ label: m.accountName, amount: round(m.net) }));
  const unclassified = moved
    .filter((m) => m.accountType === 'unclassified')
    .map((m) => ({ label: m.accountName, amount: round(m.net) }));

  const totalRevenue = round(revenue.reduce((s, l) => s + l.amount, 0));
  const totalExpenses = round(expenses.reduce((s, l) => s + l.amount, 0));

  return {
    startDate,
    endDate,
    revenue: revenue.sort((a, b) => b.amount - a.amount),
    expenses: expenses.sort((a, b) => b.amount - a.amount),
    unclassified,
    totalRevenue,
    totalExpenses,
    netProfit: round(totalRevenue - totalExpenses),
    empty: moved.length === 0,
  };
}

export interface AssetsAndLiabilities {
  asOf: string;
  assets: StatementLine[];
  liabilities: StatementLine[];
  equity: StatementLine[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  netWorth: number;
  /** The register at written-down value, shown beside the ledger. */
  register: {
    items: { label: string; cost: number; depreciation: number; writtenDown: number }[];
    totalCost: number;
    totalDepreciation: number;
    totalWrittenDown: number;
  };
  /**
   * Ledger fixed assets less the register's written-down value. Non-zero means
   * the two records of the same property disagree, which is the single most
   * useful number on the page.
   */
  reconciliation: { ledgerNet: number; registerNet: number; difference: number };
  unclassified: StatementLine[];
  empty: boolean;
}

/**
 * Statement of assets and liabilities as at a date — the "wealth statement",
 * at company level.
 *
 * The asset register is presented alongside the ledger rather than added to it.
 * They are two records of the same property, and adding them would double-count
 * everything the company owns; the point of showing both is to expose where
 * they differ.
 */
export async function assetsAndLiabilities(env: Env, asOf: string): Promise<AssetsAndLiabilities> {
  const snapshot = await readLedger(env);
  const balances = balancesAsOf(snapshot, asOf).filter((m) => m.debits !== 0 || m.credits !== 0);

  const assets = balances
    .filter((m) => m.accountType === 'asset')
    .map((m) => ({ label: m.accountName, amount: round(m.net) }));
  const liabilities = balances
    .filter((m) => m.accountType === 'liability')
    .map((m) => ({ label: m.accountName, amount: round(-m.net) }));
  const equity = balances
    .filter((m) => m.accountType === 'equity')
    .map((m) => ({ label: m.accountName, amount: round(-m.net) }));
  const unclassified = balances
    .filter((m) => m.accountType === 'unclassified')
    .map((m) => ({ label: m.accountName, amount: round(m.net) }));

  const db = getDb(env);
  const rows = await db.query.assets.findMany();
  const items = rows
    .filter((r) => !r.disposedAt || r.disposedAt > asOf)
    .filter((r) => (r.purchaseCost ?? 0) > 0)
    .map((r) => {
      const state = depreciationAsOf(r as DepreciableAsset, asOf);
      return {
        label: r.assetName,
        cost: round(r.purchaseCost ?? 0),
        // What the books carry, not what has theoretically accrued: the
        // statement must agree with the ledger, and un-posted depreciation is a
        // prompt to run the month, not a licence to write down early.
        depreciation: round(r.accumulatedDepreciation ?? 0),
        writtenDown: round((r.purchaseCost ?? 0) - (r.accumulatedDepreciation ?? 0)),
        _accrued: state.accumulated,
      };
    });

  const totalAssets = round(assets.reduce((s, l) => s + l.amount, 0));
  const totalLiabilities = round(liabilities.reduce((s, l) => s + l.amount, 0));
  const totalEquity = round(equity.reduce((s, l) => s + l.amount, 0));
  const registerNet = round(items.reduce((s, i) => s + i.writtenDown, 0));

  return {
    asOf,
    assets: assets.sort((a, b) => b.amount - a.amount),
    liabilities: liabilities.sort((a, b) => b.amount - a.amount),
    equity,
    unclassified,
    totalAssets,
    totalLiabilities,
    totalEquity,
    netWorth: round(totalAssets - totalLiabilities),
    register: {
      items: items.map(({ _accrued, ...rest }) => rest),
      totalCost: round(items.reduce((s, i) => s + i.cost, 0)),
      totalDepreciation: round(items.reduce((s, i) => s + i.depreciation, 0)),
      totalWrittenDown: registerNet,
    },
    reconciliation: {
      ledgerNet: totalAssets,
      registerNet,
      difference: round(totalAssets - registerNet),
    },
    empty: balances.length === 0 && items.length === 0,
  };
}
