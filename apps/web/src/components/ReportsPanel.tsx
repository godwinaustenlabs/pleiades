import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, FileDown, AlertTriangle, X, FileText } from 'lucide-react';
import { API, authHeaders } from '../lib/auth';
import { errorMessage } from '../lib/errors';

/**
 * The report generator, for the general journal and for the ledger accounts.
 *
 * One component parameterised by `kind` rather than two: the two reports differ
 * only in the scope control above the date range, and everything below it — the
 * request, the download, the list of what has been produced, the reconciliation
 * against the document store — is identical. Two copies of that would drift.
 *
 * The date range is deliberately clearable. An empty field means "no bound",
 * not "today", and clearing both asks for the complete history — which is a
 * normal request when the books are being handed over, not an edge case to be
 * defended against.
 */

interface GeneratedReport {
  id: string;
  docType: string;
  periodLabel: string;
  version: number;
  fileUrl: string;
  createdAt: number;
  generationBasis: {
    startDate: string | null;
    endDate: string | null;
    requestedVia: string;
    figures: Record<string, number | string | boolean | null>;
  } | null;
}

interface Option { id: string; name: string }

export type ReportKind = 'journal' | 'ledger';
type Scope = 'account' | 'ledger' | 'all';

const LABELS: Record<string, string> = {
  entries: 'Entries',
  accounts: 'Accounts',
  totalDebit: 'Debits',
  totalCredit: 'Credits',
  difference: 'Difference',
  unbalanced: 'Unbalanced entries',
  undated: 'Undated entries',
  omitted: 'Not listed',
  closingBalance: 'Closing balance',
  skippedEmpty: 'Accounts omitted as empty',
};

/** Figures worth showing on a card, in the order they make sense to read. */
const SHOWN = [
  'entries', 'accounts', 'totalDebit', 'totalCredit', 'difference',
  'closingBalance', 'unbalanced', 'undated', 'omitted', 'skippedEmpty',
];

const money = (n: unknown) =>
  typeof n === 'number'
    ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : String(n);

const COUNTS = new Set(['entries', 'accounts', 'unbalanced', 'undated', 'omitted', 'skippedEmpty']);

/** Turns a stored period_label back into something readable. */
function readablePeriod(label: string) {
  return label
    .replace(/_/g, ' ')
    .replace(/\ball time\b/, 'complete history')
    .replace(/\bto (\d{4}-\d{2}-\d{2})\b/, 'to $1');
}

export default function ReportsPanel({
  kind,
  canEdit,
  ledgers = [],
  accounts = [],
}: {
  kind: ReportKind;
  canEdit: boolean;
  ledgers?: Option[];
  accounts?: Option[];
}) {
  const docType = kind === 'journal' ? 'general_journal_report' : 'ledger_report';

  const [reports, setReports] = useState<GeneratedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [missing, setMissing] = useState(0);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [accountId, setAccountId] = useState('');
  const [ledgerId, setLedgerId] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/finance/reports`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`Could not load reports (${res.status})`);
      const { data } = await res.json();
      // Only this panel's kind: the endpoint returns both, and the journal tab
      // showing ledger reports would be a list of things its buttons cannot make.
      setReports((data.reports || []).filter((r: GeneratedReport) => r.docType === docType));
      setMissing(data.missing || 0);
    } catch (e) { setError(errorMessage(e)); } finally { setLoading(false); }
  }, [docType]);

  useEffect(() => { load(); }, [load]);

  async function generate() {
    setBusy(true); setError(null); setNotice(null);
    try {
      const body =
        kind === 'journal'
          ? { startDate, endDate, ledgerId: ledgerId || null }
          : { scope, accountId: accountId || null, ledgerId: ledgerId || null, startDate, endDate };

      const res = await fetch(`${API}/finance/reports/${kind}`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || `Could not generate (${res.status})`);

      const f = payload.data.figures || {};
      setNotice(
        f.empty
          ? 'Generated, but nothing was posted in that period — the report says so rather than printing zeroes.'
          : `Generated version ${payload.data.version}: ${payload.data.coverage}.` +
            (f.omitted ? ` ${f.omitted} rows were too many to list; the totals still cover them.` : ''),
      );
      await load();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }

  /**
   * Fetches the PDF and saves it.
   *
   * A plain `<a href>` cannot carry an Authorization header, and `application/pdf`
   * is served inline, so a link would open a viewer tab rather than download.
   * Fetching it here uses the same headers as every other call and surfaces the
   * server's reason instead of failing silently in a new tab.
   */
  async function download(r: GeneratedReport) {
    setError(null);
    setDownloading(r.id);
    try {
      const res = await fetch(`${API}${r.fileUrl.replace('/api', '')}`, { headers: authHeaders() });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body?.error ||
            (res.status === 403
              ? `You do not have permission to read ${kind} reports.`
              : `Could not download it (${res.status}).`),
        );
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `${r.docType}_${r.periodLabel}_v${r.version}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoked on a later tick: revoking synchronously can cancel the save in
      // some browsers before they have read the blob.
      setTimeout(() => URL.revokeObjectURL(href), 10_000);
    } catch (e) { setError(errorMessage(e)); } finally { setDownloading(null); }
  }

  const allTime = !startDate && !endDate;
  const field = 'w-full bg-surfaceAlt border border-white/10 rounded-xl px-3 py-2 text-sm';
  const label = 'block text-[10px] font-black uppercase tracking-wider text-textSecondary';

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-start gap-2 border border-danger/30 bg-danger/5 rounded-xl p-3 text-sm text-danger">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
        </div>
      )}
      {notice && (
        <div className="flex items-start justify-between gap-2 border border-success/30 bg-success/5 rounded-xl p-3 text-sm text-success">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="glass-panel border border-white/10 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          {kind === 'ledger' && (
            <>
              <label className="min-w-0 flex-1 basis-36 space-y-1">
                <span className={label}>Report on</span>
                <select value={scope} onChange={(e) => setScope(e.target.value as Scope)} className={field}>
                  <option value="all">Every account</option>
                  <option value="ledger">One ledger book</option>
                  <option value="account">One account</option>
                </select>
              </label>
              {scope === 'account' && (
                <label className="min-w-0 flex-1 basis-36 space-y-1">
                  <span className={label}>Account</span>
                  <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={field}>
                    <option value="">Select an account…</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </label>
              )}
              {scope === 'ledger' && (
                <label className="min-w-0 flex-1 basis-36 space-y-1">
                  <span className={label}>Ledger</span>
                  <select value={ledgerId} onChange={(e) => setLedgerId(e.target.value)} className={field}>
                    <option value="">Select a ledger…</option>
                    {ledgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </label>
              )}
            </>
          )}

          {kind === 'journal' && ledgers.length > 0 && (
            <label className="min-w-0 flex-1 basis-36 space-y-1">
              <span className={label}>Ledger</span>
              <select value={ledgerId} onChange={(e) => setLedgerId(e.target.value)} className={field}>
                <option value="">All ledgers</option>
                {ledgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
          )}

          <label className="min-w-0 flex-1 basis-36 space-y-1">
            <span className={label}>From</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={field} />
          </label>
          <label className="min-w-0 flex-1 basis-36 space-y-1">
            <span className={label}>To</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={field} />
          </label>

          <button
            type="button"
            onClick={() => { setStartDate(''); setEndDate(''); }}
            disabled={allTime}
            className="px-4 py-2 rounded-xl border border-white/10 text-[11px] font-black uppercase tracking-wider disabled:opacity-30"
          >
            All time
          </button>

          <button
            onClick={generate}
            disabled={
              !canEdit || busy ||
              (kind === 'ledger' && scope === 'account' && !accountId) ||
              (kind === 'ledger' && scope === 'ledger' && !ledgerId)
            }
            className="px-5 py-2 rounded-xl bg-success/20 text-success border border-success/30 text-[11px] font-black uppercase tracking-wider disabled:opacity-40"
          >
            {busy ? 'Generating…' : 'Generate PDF'}
          </button>
        </div>

        <p className="text-[11px] text-textSecondary leading-relaxed">
          {allTime
            ? 'No dates set, so this will cover the complete history — every entry on record.'
            : !startDate
              ? `Everything on record up to ${endDate}.`
              : !endDate
                ? `Every entry from ${startDate} onwards.`
                : `Entries from ${startDate} to ${endDate}.`}{' '}
          {kind === 'journal'
            ? 'Every entry is printed with both sides, the accounts posted to and its narration.'
            : 'Each account is printed with its opening balance, every movement and its closing balance.'}{' '}
          Figures come from the general journal. Reports are stamped DRAFT and carry their provenance
          in the footer. Regenerating adds a version rather than replacing what was circulated.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32 text-textSecondary">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
        </div>
      ) : reports.length === 0 ? (
        <div className="glass-panel border border-white/10 rounded-2xl py-12 text-center text-textSecondary">
          <FileText className="w-6 h-6 mx-auto mb-2 opacity-50" />
          {missing > 0
            ? 'No reports are in the document store. Generate one to replace them.'
            : 'No reports generated yet.'}
        </div>
      ) : (
        <div className="space-y-2">
          {reports.map((r) => (
            <div key={r.id} className="glass-panel border border-white/10 rounded-2xl p-4 flex flex-wrap items-center gap-4">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">
                  {kind === 'journal' ? 'General journal' : 'Ledger'}
                  <span className="text-textSecondary font-normal"> · v{r.version}</span>
                </div>
                <div className="text-[11px] text-textSecondary">
                  {readablePeriod(r.periodLabel)} · {new Date(r.createdAt).toLocaleString()}
                </div>
                {r.generationBasis?.figures && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px]">
                    {SHOWN
                      .filter((k) => typeof r.generationBasis!.figures[k] === 'number')
                      .map((k) => (
                        <span key={k} className="text-textSecondary">
                          {LABELS[k] || k}{' '}
                          <span className="text-textPrimary tabular-nums font-semibold">
                            {COUNTS.has(k)
                              ? String(r.generationBasis!.figures[k])
                              : money(r.generationBasis!.figures[k])}
                          </span>
                        </span>
                      ))}
                    {r.generationBasis.figures.empty === true && (
                      <span className="text-warning">nothing posted in this period</span>
                    )}
                    {r.generationBasis.figures.truncated === true && (
                      <span className="text-warning">listing abbreviated; totals complete</span>
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={() => download(r)}
                disabled={downloading === r.id}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-white/10 text-[11px] font-black uppercase tracking-wider shrink-0 disabled:opacity-40"
              >
                {downloading === r.id
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <FileDown className="w-3.5 h-3.5" />}
                Download
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Distinguishes "never generated" from "generated, and since removed from
          the bucket". The record of what was produced is kept either way. */}
      {missing > 0 && reports.length > 0 && (
        <p className="text-[11px] text-textSecondary">
          {missing} earlier {missing === 1 ? 'report is' : 'reports are'} no longer in the document
          store and {missing === 1 ? 'is' : 'are'} not listed. Generate the period again to replace{' '}
          {missing === 1 ? 'it' : 'them'}.
        </p>
      )}
    </div>
  );
}
