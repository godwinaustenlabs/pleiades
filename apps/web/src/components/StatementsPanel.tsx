import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, FileDown, AlertTriangle, X, FileText } from 'lucide-react';
import { API, authHeaders } from '../lib/auth';
import { errorMessage } from '../lib/errors';

/**
 * Generated statements: produce one, and download the ones already produced.
 *
 * Every statement is a versioned PDF in R2 with the figures it reported stored
 * beside it, so the list can show what a document said without re-reading the
 * ledger — and so a statement someone circulated last week still exists after
 * the same period is regenerated.
 */

interface GeneratedDoc {
  id: string;
  docType: string;
  periodLabel: string;
  version: number;
  fileUrl: string;
  createdAt: number;
  generationBasis: {
    startDate: string | null;
    endDate: string;
    requestedVia: string;
    figures: Record<string, number | boolean>;
  } | null;
}

const TYPES = [
  { id: 'profit_and_loss', label: 'Profit & loss', period: true },
  { id: 'assets_and_liabilities', label: 'Assets & liabilities', period: false },
] as const;

const money = (n: unknown) =>
  typeof n === 'number'
    ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : String(n);

const LABELS: Record<string, string> = {
  totalRevenue: 'Revenue',
  totalExpenses: 'Expenses',
  netProfit: 'Net profit',
  totalAssets: 'Assets',
  totalLiabilities: 'Liabilities',
  netWorth: 'Net worth',
  registerWrittenDown: 'Register (written down)',
  reconciliationDifference: 'Ledger vs register',
};

export default function StatementsPanel({ canEdit }: { canEdit: boolean }) {
  const [docs, setDocs] = useState<GeneratedDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const [type, setType] = useState<(typeof TYPES)[number]['id']>('profit_and_loss');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/finance/statements`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`Could not load statements (${res.status})`);
      const { data } = await res.json();
      setDocs(data || []);
    } catch (e) { setError(errorMessage(e)); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function generate() {
    setBusy(true); setError(null); setNotice(null);
    try {
      const res = await fetch(`${API}/finance/statements`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, startDate, endDate }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || `Could not generate (${res.status})`);
      setNotice(
        body.data.figures.empty
          ? 'Generated, but nothing was posted in that period — the statement says so rather than reporting zeroes.'
          : `Generated version ${body.data.version}.`,
      );
      await load();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }

  /**
   * Fetches the PDF and saves it.
   *
   * A plain `<a href>` cannot carry an Authorization header, so it had to put
   * the token in the query string and hope the browser did the rest — and even
   * when that authenticated, `application/pdf` is served inline, so the click
   * opened a viewer tab instead of downloading anything. Fetching it here uses
   * the same headers as every other call, saves under a readable name, and
   * surfaces the server's reason instead of failing silently in a new tab.
   */
  async function download(d: GeneratedDoc) {
    setError(null);
    setDownloading(d.id);
    try {
      const res = await fetch(`${API}${d.fileUrl.replace('/api', '')}`, { headers: authHeaders() });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body?.error ||
            (res.status === 403
              ? 'You do not have permission to read finance documents.'
              : `Could not download it (${res.status}).`),
        );
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `${d.docType}_${d.periodLabel}_v${d.version}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoked on the next tick: revoking synchronously can cancel the save in
      // some browsers before it has read the blob.
      setTimeout(() => URL.revokeObjectURL(href), 10_000);
    } catch (e) { setError(errorMessage(e)); } finally { setDownloading(null); }
  }

  const needsPeriod = TYPES.find((t) => t.id === type)?.period;

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-start gap-2 border border-red-500/30 bg-red-500/5 rounded-xl p-3 text-sm text-red-500">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
        </div>
      )}
      {notice && (
        <div className="flex items-start justify-between gap-2 border border-emerald-500/30 bg-emerald-500/5 rounded-xl p-3 text-sm text-emerald-500">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="glass-panel border border-white/10 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1">
            <span className="block text-[10px] font-black uppercase tracking-wider text-textSecondary">Statement</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as any)}
              className="bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm"
            >
              {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </label>

          {needsPeriod && (
            <label className="space-y-1">
              <span className="block text-[10px] font-black uppercase tracking-wider text-textSecondary">From</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm"
              />
            </label>
          )}

          <label className="space-y-1">
            <span className="block text-[10px] font-black uppercase tracking-wider text-textSecondary">
              {needsPeriod ? 'To' : 'As at'}
            </span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm"
            />
          </label>

          <button
            onClick={generate}
            disabled={!canEdit || busy}
            className="px-5 py-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-black uppercase tracking-wider disabled:opacity-40"
          >
            {busy ? 'Generating…' : 'Generate PDF'}
          </button>
        </div>
        <p className="text-[11px] text-textSecondary leading-relaxed">
          Figures come from the general journal and the asset register. Every statement is stamped
          DRAFT and carries its provenance in the footer — nothing here is filed with any authority.
          Regenerating a period adds a version rather than replacing what was circulated.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32 text-textSecondary">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
        </div>
      ) : docs.length === 0 ? (
        <div className="glass-panel border border-white/10 rounded-2xl py-12 text-center text-textSecondary">
          <FileText className="w-6 h-6 mx-auto mb-2 opacity-50" />
          No statements generated yet.
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((d) => (
            <div key={d.id} className="glass-panel border border-white/10 rounded-2xl p-4 flex flex-wrap items-center gap-4">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">
                  {TYPES.find((t) => t.id === d.docType)?.label || d.docType}
                  <span className="text-textSecondary font-normal"> · v{d.version}</span>
                </div>
                <div className="text-[11px] text-textSecondary">
                  {d.periodLabel.replace(/_/g, ' ')} · {new Date(d.createdAt).toLocaleString()}
                </div>
                {d.generationBasis?.figures && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px]">
                    {Object.entries(d.generationBasis.figures)
                      .filter(([k, v]) => k !== 'empty' && typeof v === 'number')
                      .map(([k, v]) => (
                        <span key={k} className="text-textSecondary">
                          {LABELS[k] || k}{' '}
                          <span className="text-textPrimary tabular-nums font-semibold">{money(v)}</span>
                        </span>
                      ))}
                    {d.generationBasis.figures.empty === true && (
                      <span className="text-amber-500">nothing posted in this period</span>
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={() => download(d)}
                disabled={downloading === d.id}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-white/10 text-[11px] font-black uppercase tracking-wider shrink-0 disabled:opacity-40"
              >
                {downloading === d.id
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <FileDown className="w-3.5 h-3.5" />}
                Download
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
