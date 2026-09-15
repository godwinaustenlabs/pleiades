import { Env } from '../index';
import { fileDocument, letterhead, statementKey } from './file';
import { StatementDoc } from './layout';
import {
  assetsAndLiabilities,
  profitAndLoss,
  type AssetsAndLiabilities,
  type ProfitAndLoss,
} from './data';

/**
 * Renders a statement, files it in R2, and records it.
 *
 * Versioning, the bucket write and the `generated_documents` row all live in
 * `file.ts`, shared with the ledger reports — see the note there on why there
 * is one implementation of that rather than two.
 */

export type StatementType = 'profit_and_loss' | 'assets_and_liabilities';

export interface StatementRequest {
  type: StatementType;
  startDate?: string;
  endDate: string;
  actorUserId: string;
  /** How this was asked for. Printed in the footer of every page. */
  requestedVia: string;
}

export interface StatementResult {
  docId: string;
  docType: StatementType;
  periodLabel: string;
  version: number;
  r2Key: string;
  url: string;
  bytes: number;
  figures: Record<string, number | boolean>;
}

const humanDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });

function renderProfitAndLoss(doc: StatementDoc, pl: ProfitAndLoss) {
  if (pl.empty) {
    doc.note(
      'No journal entries fall within this period, so there is nothing to report. This is a ' +
        'statement of absence, not a set of zeroes: if you expected activity here, check the ' +
        'entry dates on the journals rather than reading these totals as measured.',
    );
    return;
  }

  doc.section('Revenue');
  if (pl.revenue.length === 0) doc.note('No revenue accounts moved in this period.');
  for (const l of pl.revenue) doc.line(l.label, l.amount);
  doc.total('Total revenue', pl.totalRevenue);

  doc.section('Expenses');
  if (pl.expenses.length === 0) doc.note('No expense accounts moved in this period.');
  for (const l of pl.expenses) doc.line(l.label, l.amount);
  doc.total('Total expenses', pl.totalExpenses);

  doc.total(pl.netProfit >= 0 ? 'Net profit' : 'Net loss', pl.netProfit, true);

  if (pl.unclassified.length > 0) {
    doc.section('Not classified');
    for (const l of pl.unclassified) doc.line(l.label, l.amount);
    doc.note(
      'These accounts have no account type set, so they cannot be placed in revenue or expenses ' +
        'and are excluded from the totals above. Set their type in Accounts and regenerate.',
    );
  }
}

function renderAssetsAndLiabilities(doc: StatementDoc, s: AssetsAndLiabilities) {
  if (s.empty) {
    doc.note('Nothing is recorded in the ledger or the asset register as at this date.');
    return;
  }

  doc.section('Assets');
  for (const l of s.assets) doc.line(l.label, l.amount);
  doc.total('Total assets', s.totalAssets);

  doc.section('Liabilities');
  if (s.liabilities.length === 0) doc.note('No liability accounts carry a balance at this date.');
  for (const l of s.liabilities) doc.line(l.label, l.amount);
  doc.total('Total liabilities', s.totalLiabilities);

  doc.total('Net worth', s.netWorth, true);

  if (s.equity.length > 0) {
    doc.section('Equity');
    for (const l of s.equity) doc.line(l.label, l.amount);
    doc.total('Total equity', s.totalEquity);
  }

  if (s.register.items.length > 0) {
    doc.section('Asset register');
    doc.table(
      ['Asset', 'Cost', 'Depreciation', 'Written down'],
      s.register.items.map((i) => [i.label, i.cost, i.depreciation, i.writtenDown] as [string, number, number, number]),
    );
    doc.total('Register at written-down value', s.register.totalWrittenDown);
    doc.note(
      'The register is shown beside the ledger, never added to it: they are two records of the ' +
        'same property, and adding them would double-count everything the company owns. ' +
        `Ledger assets ${s.reconciliation.ledgerNet.toFixed(2)} against register ` +
        `${s.reconciliation.registerNet.toFixed(2)}` +
        (Math.abs(s.reconciliation.difference) > 0.01
          ? ` — a difference of ${s.reconciliation.difference.toFixed(2)}, which is worth explaining before this is relied on.`
          : ' — they agree.'),
    );
  }

  if (s.unclassified.length > 0) {
    doc.section('Not classified');
    for (const l of s.unclassified) doc.line(l.label, l.amount);
    doc.note('These accounts have no account type set and are excluded from the totals above.');
  }
}

export async function generateStatement(
  env: Env,
  req: StatementRequest,
): Promise<StatementResult | { error: string }> {
  const head = await letterhead(env);

  const isPeriod = req.type === 'profit_and_loss';
  const startDate = req.startDate || `${req.endDate.slice(0, 4)}-01-01`;
  if (isPeriod && startDate > req.endDate) {
    return { error: 'The start date is after the end date.' };
  }

  const periodLabel = isPeriod ? `${startDate}_to_${req.endDate}` : `as_at_${req.endDate}`;

  const title = isPeriod ? 'Profit and Loss Account' : 'Statement of Assets and Liabilities';
  const subtitle = isPeriod
    ? `For the period ${humanDate(startDate)} to ${humanDate(req.endDate)}`
    : `As at ${humanDate(req.endDate)}`;

  const doc = await StatementDoc.create({
    title,
    subtitle,
    organisation: head.organisation + (head.ntn ? `  ·  NTN ${head.ntn}` : ''),
    currency: head.currency,
    // Provenance on every page: a figure nobody can trace back is a figure
    // nobody should sign.
    provenance:
      `Generated by Pleiades from general_journals and the asset register on ` +
      `${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · ${req.requestedVia} · ` +
      `amounts in ${head.currency}`,
    draft: true,
  });

  let figures: Record<string, number | boolean>;
  if (isPeriod) {
    const pl = await profitAndLoss(env, startDate, req.endDate);
    renderProfitAndLoss(doc, pl);
    figures = {
      totalRevenue: pl.totalRevenue,
      totalExpenses: pl.totalExpenses,
      netProfit: pl.netProfit,
      empty: pl.empty,
    };
  } else {
    const bs = await assetsAndLiabilities(env, req.endDate);
    renderAssetsAndLiabilities(doc, bs);
    figures = {
      totalAssets: bs.totalAssets,
      totalLiabilities: bs.totalLiabilities,
      netWorth: bs.netWorth,
      registerWrittenDown: bs.register.totalWrittenDown,
      reconciliationDifference: bs.reconciliation.difference,
      empty: bs.empty,
    };
  }

  const bytes = await doc.save();

  const filed = await fileDocument(
    env,
    {
      docType: req.type,
      periodLabel,
      bytes,
      actorUserId: req.actorUserId,
      basis: {
        source: 'general_journals + assets register',
        startDate: isPeriod ? startDate : null,
        endDate: req.endDate,
        requestedVia: req.requestedVia,
        figures,
      },
    },
    (version) => statementKey(req.type, periodLabel, version),
  );
  if ('error' in filed) return filed;

  return { ...filed, docType: req.type, figures };
}
