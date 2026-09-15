import { and, gte, lte } from 'drizzle-orm';
import { getDb, schema } from '@pleiades/database';
import { Env } from '../index';
import { journalLines, normaliseType } from './data';

/**
 * The figures behind the two ledger reports: the general journal, and the
 * ledger accounts themselves.
 *
 * These sit beside `data.ts` and share its journal reader for the same reason
 * it exists — a report has to be reproducible without a model. The agent can
 * ask for one, but nothing it says reaches these numbers.
 *
 * Where a statement summarises, these two transcribe. That difference sets
 * everything below: a summary of an empty period is one line, whereas a
 * transcript of six years is tens of thousands, and "generate the whole
 * journal" has to produce a correct document rather than an error. So the
 * totals here are always computed over every matching row, and only the
 * *listing* is bounded — a long report is abbreviated and says so, never
 * silently wrong and never a 500.
 */

/**
 * How many detail rows a single report will draw.
 *
 * A Worker has a CPU budget and a response has to fit in memory; at roughly
 * 55 rows to a page this is about 110 pages, which is already past the point
 * anyone reads sequentially. Beyond it the report keeps its totals — which
 * cover everything — and says how many rows it did not print, so the reader
 * knows to narrow the range rather than believing they have the lot.
 */
export const MAX_DETAIL_ROWS = 6000;

const round = (n: number) => Math.round(n * 100) / 100;

/** A date range where either end may be open. `null` means "no bound". */
export interface DateRange {
  startDate: string | null;
  endDate: string | null;
}

export const isAllTime = (r: DateRange) => !r.startDate && !r.endDate;

/** Reads `lines`, tolerating the legacy two-column form. Shared with statements. */
function linesOf(journal: any) {
  return journalLines(journal).filter((l) => l && l.accountId);
}

/**
 * Sorts by entry date, then by id so the order is stable between runs.
 *
 * Undated entries sort last rather than first: `null` ahead of every date
 * would open the report with rows the reader cannot place.
 */
function byDateThenId(a: any, b: any) {
  const ad = a.entryDate || '￿';
  const bd = b.entryDate || '￿';
  if (ad !== bd) return ad < bd ? -1 : 1;
  return String(a.id) < String(b.id) ? -1 : 1;
}

/* ── The general journal ─────────────────────────────────────────────────── */

export interface JournalReportLine {
  accountId: string;
  accountName: string;
  type: 'debit' | 'credit';
  amount: number;
}

export interface JournalReportEntry {
  id: string;
  entryDate: string | null;
  description: string;
  ledgerName: string | null;
  invoiceId: string | null;
  lines: JournalReportLine[];
  debit: number;
  credit: number;
  /** Debits equal credits. A double entry that does not is worth pointing at. */
  balanced: boolean;
}

export interface JournalReport {
  range: DateRange;
  ledgerId: string | null;
  ledgerName: string | null;
  /** The entries printed. A prefix of the matching set when `truncated`. */
  entries: JournalReportEntry[];
  /** Entries that matched, before any truncation. */
  entryCount: number;
  /** Rows the listing did not reach. Zero unless `truncated`. */
  omitted: number;
  truncated: boolean;
  /** Over every matching entry, not only the printed ones. */
  totalDebit: number;
  totalCredit: number;
  /** Matching entries whose own debits and credits disagree. */
  unbalanced: number;
  /**
   * Entries carrying no date. SQL comparison drops these from any bounded
   * range, so they can only appear in an all-time report — counted here so a
   * bounded report can say they were left out rather than losing them quietly.
   */
  undated: number;
  empty: boolean;
}

export interface JournalReportRequest extends DateRange {
  ledgerId?: string | null;
}

export async function journalReport(
  env: Env,
  req: JournalReportRequest,
): Promise<JournalReport> {
  const db = getDb(env);

  const filters = [];
  if (req.startDate) filters.push(gte(schema.generalJournals.entryDate, req.startDate));
  if (req.endDate) filters.push(lte(schema.generalJournals.entryDate, req.endDate));

  const [rows, accounts, ledgers] = await Promise.all([
    db.query.generalJournals.findMany({
      where: filters.length > 0 ? and(...filters) : undefined,
    }),
    db.query.accounts.findMany(),
    db.query.ledgers.findMany(),
  ]);

  const accountName = new Map(accounts.map((a) => [a.id, a.accountName]));
  const ledgerName = new Map(ledgers.map((l) => [l.id, l.ledgerName]));

  // The ledger filter is applied here rather than in SQL so that an entry with
  // no `ledger_id` is treated consistently: it belongs to no book, so a report
  // on one book excludes it, and the unfiltered report still shows it.
  const matching = (req.ledgerId ? rows.filter((r) => r.ledgerId === req.ledgerId) : rows)
    .slice()
    .sort(byDateThenId);

  let totalDebit = 0;
  let totalCredit = 0;
  let unbalanced = 0;
  let undated = 0;
  const entries: JournalReportEntry[] = [];
  let rowBudget = MAX_DETAIL_ROWS;

  for (const r of matching) {
    const lines: JournalReportLine[] = linesOf(r).map((l) => ({
      accountId: l.accountId,
      // An account that has been deleted out from under a posted entry still
      // has to print as something: naming the id is more use than a blank.
      accountName: accountName.get(l.accountId) || `(unknown account ${l.accountId})`,
      type: l.type === 'credit' ? 'credit' : 'debit',
      amount: round(l.amount || 0),
    }));

    const debit = round(lines.filter((l) => l.type === 'debit').reduce((s, l) => s + l.amount, 0));
    const credit = round(lines.filter((l) => l.type === 'credit').reduce((s, l) => s + l.amount, 0));
    const balanced = Math.abs(debit - credit) < 0.01;

    totalDebit = round(totalDebit + debit);
    totalCredit = round(totalCredit + credit);
    if (!balanced) unbalanced += 1;
    if (!r.entryDate) undated += 1;

    // One row for the entry plus one per line. Counted before pushing so the
    // budget is never overspent by a wide compound entry.
    const cost = 1 + lines.length;
    if (rowBudget >= cost) {
      rowBudget -= cost;
      entries.push({
        id: r.id,
        entryDate: r.entryDate ?? null,
        description: r.description || '',
        ledgerName: r.ledgerId ? ledgerName.get(r.ledgerId) ?? null : null,
        invoiceId: r.invoiceId ?? null,
        lines,
        debit,
        credit,
        balanced,
      });
    }
  }

  return {
    range: { startDate: req.startDate ?? null, endDate: req.endDate ?? null },
    ledgerId: req.ledgerId ?? null,
    ledgerName: req.ledgerId ? ledgerName.get(req.ledgerId) ?? null : null,
    entries,
    entryCount: matching.length,
    omitted: matching.length - entries.length,
    truncated: entries.length < matching.length,
    totalDebit,
    totalCredit,
    unbalanced,
    undated,
    empty: matching.length === 0,
  };
}

/* ── The ledger accounts ─────────────────────────────────────────────────── */

export interface LedgerReportEntry {
  id: string;
  entryDate: string | null;
  description: string;
  /** The other side of the entry: what this account was posted against. */
  contra: string;
  debit: number;
  credit: number;
  /** Running balance after this entry. Positive is a debit balance. */
  balance: number;
}

export interface LedgerAccountReport {
  accountId: string;
  accountName: string;
  accountType: string;
  ledgerName: string | null;
  /** Signed, debit-positive. Zero when the report runs from inception. */
  openingBalance: number;
  entries: LedgerReportEntry[];
  entryCount: number;
  omitted: number;
  truncated: boolean;
  totalDebit: number;
  totalCredit: number;
  /** Signed, debit-positive. Opening plus the period's movement. */
  closingBalance: number;
}

export type LedgerScope = 'account' | 'ledger' | 'all';

export interface LedgerReport {
  scope: LedgerScope;
  /** What was asked for, in words: an account name, a book name, or "all". */
  scopeLabel: string;
  range: DateRange;
  accounts: LedgerAccountReport[];
  /** Accounts in scope that never moved and carry no balance. */
  skippedEmpty: number;
  totalDebit: number;
  totalCredit: number;
  /**
   * Debits less credits across every account shown. A ledger in balance sums
   * to zero; anything else is a real finding and belongs on the page.
   */
  net: number;
  truncated: boolean;
  empty: boolean;
}

export interface LedgerReportRequest extends DateRange {
  scope: LedgerScope;
  accountId?: string | null;
  ledgerId?: string | null;
}

export async function ledgerReport(
  env: Env,
  req: LedgerReportRequest,
): Promise<LedgerReport | { error: string }> {
  const db = getDb(env);

  // Everything is read, not just the range: the opening balance of a bounded
  // report is precisely the entries the range excludes.
  const [allJournals, accounts, ledgers] = await Promise.all([
    db.query.generalJournals.findMany(),
    db.query.accounts.findMany(),
    db.query.ledgers.findMany(),
  ]);

  const accountName = new Map(accounts.map((a) => [a.id, a.accountName]));
  const ledgerName = new Map(ledgers.map((l) => [l.id, l.ledgerName]));

  let inScope = accounts;
  let scopeLabel = 'All ledger accounts';

  if (req.scope === 'account') {
    if (!req.accountId) return { error: 'accountId is required when scope is "account".' };
    const acc = accounts.find((a) => a.id === req.accountId);
    if (!acc) return { error: `No account with id ${req.accountId}.` };
    inScope = [acc];
    scopeLabel = acc.accountName;
  } else if (req.scope === 'ledger') {
    if (!req.ledgerId) return { error: 'ledgerId is required when scope is "ledger".' };
    const book = ledgers.find((l) => l.id === req.ledgerId);
    if (!book) return { error: `No ledger with id ${req.ledgerId}.` };
    inScope = accounts.filter((a) => a.ledgerId === req.ledgerId);
    scopeLabel = book.ledgerName;
    if (inScope.length === 0) {
      return {
        error:
          `The ledger "${book.ledgerName}" has no accounts linked to it, so there is nothing ` +
          'to report. Link accounts to it in Accounts first.',
      };
    }
  }

  const scopeIds = new Set(inScope.map((a) => a.id));

  /** Per account: what happened before the range, and what happened within it. */
  const prior = new Map<string, number>();
  const within = new Map<string, LedgerReportEntry[]>();
  for (const id of scopeIds) { prior.set(id, 0); within.set(id, []); }

  const sorted = allJournals.slice().sort(byDateThenId);

  for (const j of sorted) {
    const lines = linesOf(j);
    if (lines.length === 0) continue;

    // Only entries the range admits. An undated entry cannot be placed in a
    // bounded range at all, so it counts only towards an all-time report —
    // the same rule the journal report follows, applied here in JavaScript
    // because the priors have to be read anyway.
    const date = j.entryDate ?? null;
    const before = !!(req.startDate && (!date || date < req.startDate));
    const after = !!(req.endDate && (!date || date > req.endDate));
    if (!date && (req.startDate || req.endDate)) continue;

    for (const id of scopeIds) {
      const mine = lines.filter((l) => l.accountId === id);
      if (mine.length === 0) continue;

      const debit = round(mine.filter((l) => l.type === 'debit').reduce((s, l) => s + (l.amount || 0), 0));
      const credit = round(mine.filter((l) => l.type === 'credit').reduce((s, l) => s + (l.amount || 0), 0));
      if (debit === 0 && credit === 0) continue;

      if (before) { prior.set(id, round(prior.get(id)! + debit - credit)); continue; }
      if (after) continue;

      // The contra side: what this posting was against. A compound entry has
      // several, and naming them is most of what makes a ledger page readable.
      const contras = [
        ...new Set(
          lines
            .filter((l) => l.accountId !== id)
            .map((l) => accountName.get(l.accountId) || `(unknown account ${l.accountId})`),
        ),
      ];

      within.get(id)!.push({
        id: j.id,
        entryDate: date,
        description: j.description || '',
        contra: contras.length === 0 ? '(same account)' : contras.join(', '),
        debit,
        credit,
        balance: 0, // filled in below, once the opening balance is known
      });
    }
  }

  let rowBudget = MAX_DETAIL_ROWS;
  const out: LedgerAccountReport[] = [];
  let skippedEmpty = 0;
  let truncated = false;

  for (const acc of inScope) {
    const opening = prior.get(acc.id) ?? 0;
    const rows = within.get(acc.id) ?? [];

    // Nothing ever touched it and it carries nothing. Counted, not printed:
    // a chart of accounts padded with untouched rows buries the ones that moved.
    if (rows.length === 0 && Math.abs(opening) < 0.01) { skippedEmpty += 1; continue; }

    const totalDebit = round(rows.reduce((s, r) => s + r.debit, 0));
    const totalCredit = round(rows.reduce((s, r) => s + r.credit, 0));
    const closingBalance = round(opening + totalDebit - totalCredit);

    // Running balance over every row, then the listing is cut to the budget.
    // Computed first so a truncated page still shows a correct balance against
    // each row it does print.
    let running = opening;
    for (const r of rows) {
      running = round(running + r.debit - r.credit);
      r.balance = running;
    }

    // Two rows of headroom per account for its opening and closing lines.
    const take = Math.max(0, Math.min(rows.length, rowBudget - 2));
    rowBudget -= take + 2;
    if (take < rows.length) truncated = true;

    out.push({
      accountId: acc.id,
      accountName: acc.accountName,
      accountType: normaliseType(acc.accountType),
      ledgerName: acc.ledgerId ? ledgerName.get(acc.ledgerId) ?? null : null,
      openingBalance: opening,
      entries: rows.slice(0, take),
      entryCount: rows.length,
      omitted: rows.length - take,
      truncated: take < rows.length,
      totalDebit,
      totalCredit,
      closingBalance,
    });

    if (rowBudget <= 2) rowBudget = 0;
  }

  const totalDebit = round(out.reduce((s, a) => s + a.totalDebit, 0));
  const totalCredit = round(out.reduce((s, a) => s + a.totalCredit, 0));

  return {
    scope: req.scope,
    scopeLabel,
    range: { startDate: req.startDate ?? null, endDate: req.endDate ?? null },
    accounts: out,
    skippedEmpty,
    totalDebit,
    totalCredit,
    net: round(totalDebit - totalCredit),
    truncated,
    empty: out.length === 0,
  };
}
