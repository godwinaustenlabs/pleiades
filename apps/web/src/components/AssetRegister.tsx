import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, Plus, Trash2, Package, TrendingDown, AlertTriangle, X, Archive,
} from 'lucide-react';
import { API, authHeaders } from '../lib/auth';
import { errorMessage } from '../lib/errors';

/**
 * The asset register, as a tab in Accounting.
 *
 * Not the page's generic GAGrid: this endpoint answers with valuations and
 * totals rather than a flat row list, and the two actions that matter here —
 * running depreciation and disposing of something — have no equivalent in a
 * CRUD grid. HR can still assign an asset to a person; what it never had was
 * anywhere to record what the thing cost.
 */

interface Asset {
  id: string;
  assetName: string;
  assetClass: string | null;
  assetType: string;
  serialNumber: string | null;
  vendor: string | null;
  purchaseCost: number | null;
  purchaseDate: string | null;
  salvageValue: number | null;
  usefulLifeMonths: number | null;
  status: string;
  assignedTo: string | null;
  disposedAt: string | null;
  depreciationExpenseAccountId: string | null;
  accumulatedDepreciationAccountId: string | null;
  monthlyDepreciation: number;
  accumulatedPosted: number;
  unpostedDepreciation: number;
  writtenDownValue: number;
  fullyDepreciated: boolean;
  depreciable: boolean;
}

interface Totals {
  count: number;
  cost: number;
  accumulatedDepreciation: number;
  writtenDownValue: number;
  unposted: number;
}

interface Account { id: string; accountName: string; accountType: string | null }

const money = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CLASSES = ['laptop', 'equipment', 'furniture', 'vehicle', 'building', 'stationery', 'other'];

const emptyDraft = {
  assetName: '', assetClass: 'laptop', serialNumber: '', vendor: '',
  purchaseCost: '', purchaseDate: '', salvageValue: '', usefulLifeMonths: '',
  depreciationExpenseAccountId: '', accumulatedDepreciationAccountId: '',
};

export default function AssetRegister({ canEdit, canDelete }: { canEdit: boolean; canDelete: boolean }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState({ ...emptyDraft });
  const [saving, setSaving] = useState(false);
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [schedule, setSchedule] = useState<any>(null);
  const [posting, setPosting] = useState(false);
  const [includeDisposed, setIncludeDisposed] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`${API}/finance/assets?includeDisposed=${includeDisposed}`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`Could not load the register (${res.status})`);
      const { data } = await res.json();
      setAssets(data.assets || []);
      setTotals(data.totals || null);
    } catch (e) { setError(errorMessage(e)); } finally { setLoading(false); }
  }, [includeDisposed]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch(`${API}/finance/accounts`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((b) => setAccounts(b.data || []))
      .catch(() => { /* the register works without the chart of accounts */ });
  }, []);

  async function create() {
    setSaving(true); setError(null);
    try {
      const body: Record<string, unknown> = { ...draft };
      for (const k of Object.keys(body)) if (body[k] === '') delete body[k];
      const res = await fetch(`${API}/finance/assets`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b?.error || `Could not save (${res.status})`);
      setShowForm(false); setDraft({ ...emptyDraft });
      await load();
    } catch (e) { setError(errorMessage(e)); } finally { setSaving(false); }
  }

  async function remove(a: Asset) {
    setError(null);
    try {
      const res = await fetch(`${API}/finance/assets/${a.id}`, { method: 'DELETE', headers: authHeaders() });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b?.error || `Could not delete (${res.status})`);
      await load();
    } catch (e) { setError(errorMessage(e)); }
  }

  async function dispose(a: Asset) {
    setError(null);
    try {
      const res = await fetch(`${API}/finance/assets/${a.id}/dispose`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ disposedAt: new Date().toISOString().slice(0, 10) }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Could not dispose');
      setNotice(`${a.assetName} disposed. It stops depreciating from today.`);
      await load();
    } catch (e) { setError(errorMessage(e)); }
  }

  const previewRun = useCallback(async () => {
    setError(null); setSchedule(null);
    try {
      const res = await fetch(`${API}/finance/assets/depreciation?period=${period}`, { headers: authHeaders() });
      const b = await res.json();
      if (!res.ok) throw new Error(b?.error || 'Could not compute the schedule');
      setSchedule(b.data);
    } catch (e) { setError(errorMessage(e)); }
  }, [period]);

  async function post() {
    setPosting(true); setError(null);
    try {
      const res = await fetch(`${API}/finance/assets/post-depreciation`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ period }),
      });
      const b = await res.json();
      if (!res.ok) throw new Error(b?.error || 'Could not post');
      setNotice(
        b.data.posted
          ? `Posted ${money(b.data.total)} for ${period} across ${b.data.assets} asset(s). Journal ${b.data.journalId}.`
          : `Nothing to post for ${period}.`,
      );
      setSchedule(null);
      await load();
    } catch (e) { setError(errorMessage(e)); } finally { setPosting(false); }
  }

  // Accounts are unfiltered by type on purpose: `account_type` is nullable and
  // written in mixed case across the app, so filtering it would hide real
  // accounts. The label carries the type where there is one.
  const accountOptions = useMemo(
    () => accounts.map((a) => ({ id: a.id, label: `${a.accountName}${a.accountType ? ` · ${a.accountType}` : ''}` })),
    [accounts],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-textSecondary">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading the register…
      </div>
    );
  }

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

      {/* What the company owns, in four figures. `unposted` is the one that
          prompts action: depreciation earned but not yet in the ledger. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ['Assets', totals?.count ?? 0, false],
          ['At cost', money(totals?.cost ?? 0), true],
          ['Depreciation posted', money(totals?.accumulatedDepreciation ?? 0), true],
          ['Written-down value', money(totals?.writtenDownValue ?? 0), true],
        ].map(([label, value]) => (
          <div key={label as string} className="glass-panel border border-white/10 rounded-2xl p-4">
            <div className="text-[10px] font-black uppercase tracking-wider text-textSecondary">{label}</div>
            <div className="text-xl font-bold mt-1 tabular-nums">{value as string}</div>
          </div>
        ))}
      </div>

      {!!totals?.unposted && (
        <div className="flex items-center gap-2 text-sm text-warning border border-warning/30 bg-warning/5 rounded-xl p-3">
          <TrendingDown className="w-4 h-4 shrink-0" />
          {money(totals.unposted)} of depreciation has accrued but is not in the ledger yet.
        </div>
      )}

      {/* The monthly run. Previewed before it posts: an accountant should see
          the schedule before authorising the journal that acts on it. */}
      <div className="glass-panel border border-white/10 rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-black uppercase tracking-wider text-textSecondary">
            Depreciation run
          </span>
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="bg-surfaceAlt border border-white/10 rounded-xl px-3 py-1.5 text-sm"
          />
          <button
            onClick={previewRun}
            className="px-4 py-1.5 rounded-xl border border-white/10 text-[11px] font-black uppercase tracking-wider"
          >
            Preview
          </button>
          <button
            onClick={post}
            disabled={!canEdit || posting}
            className="px-4 py-1.5 rounded-xl bg-success/20 text-success border border-success/30 text-[11px] font-black uppercase tracking-wider disabled:opacity-40"
          >
            {posting ? 'Posting…' : 'Post to journal'}
          </button>
        </div>

        {schedule && (
          <div className="text-sm space-y-2">
            {schedule.lines.length === 0 ? (
              <p className="text-textSecondary">Nothing to charge for {schedule.period}.</p>
            ) : (
              <>
                <div className="divide-y divide-white/10">
                  {schedule.lines.map((l: any) => (
                    <div key={l.assetId} className="flex items-center justify-between py-1.5 gap-3">
                      <span className="truncate">{l.assetName}</span>
                      <span className="flex items-center gap-3 shrink-0">
                        {l.blocked && (
                          <span className="text-[10px] text-warning uppercase tracking-wider">{l.blocked}</span>
                        )}
                        <span className="tabular-nums">{money(l.charge)}</span>
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between font-bold pt-1">
                  <span>Postable</span>
                  <span className="tabular-nums">{money(schedule.postable)}</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs text-textSecondary">
          <input
            type="checkbox"
            checked={includeDisposed}
            onChange={(e) => setIncludeDisposed(e.target.checked)}
            className="accent-primary"
          />
          Show disposed
        </label>
        <button
          onClick={() => setShowForm((v) => !v)}
          disabled={!canEdit}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-success/20 text-success border border-success/30 text-[11px] font-black uppercase tracking-wider disabled:opacity-40"
        >
          <Plus className="w-3.5 h-3.5" /> Add asset
        </button>
      </div>

      {showForm && (
        <div className="glass-panel border border-white/10 rounded-2xl p-5 space-y-3">
          <div className="grid md:grid-cols-3 gap-3">
            {[
              ['assetName', 'Name', 'text'],
              ['serialNumber', 'Serial number', 'text'],
              ['vendor', 'Vendor', 'text'],
              ['purchaseCost', 'Purchase cost', 'number'],
              ['purchaseDate', 'Purchase date', 'date'],
              ['salvageValue', 'Salvage value', 'number'],
              ['usefulLifeMonths', 'Useful life (months)', 'number'],
            ].map(([key, label, type]) => (
              <label key={key} className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-textSecondary">{label}</span>
                <input
                  type={type}
                  value={(draft as any)[key]}
                  onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                  className="w-full bg-surfaceAlt border border-white/10 rounded-xl px-3 py-2 text-sm"
                />
              </label>
            ))}
            <label className="space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-textSecondary">Class</span>
              <select
                value={draft.assetClass}
                onChange={(e) => setDraft((d) => ({ ...d, assetClass: e.target.value }))}
                className="w-full bg-surfaceAlt border border-white/10 rounded-xl px-3 py-2 text-sm"
              >
                {CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            {([
              ['depreciationExpenseAccountId', 'Depreciation expense account'],
              ['accumulatedDepreciationAccountId', 'Accumulated depreciation account'],
            ] as const).map(([key, label]) => (
              <label key={key} className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-textSecondary">{label}</span>
                <select
                  value={(draft as any)[key]}
                  onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                  className="w-full bg-surfaceAlt border border-white/10 rounded-xl px-3 py-2 text-sm"
                >
                  <option value="">— not set —</option>
                  {accountOptions.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </label>
            ))}
          </div>
          <p className="text-[11px] text-textSecondary">
            Leave the life blank to use the default for the class. Without both accounts the asset is
            tracked but its depreciation cannot be posted.
          </p>
          <div className="flex gap-2">
            <button
              onClick={create}
              disabled={saving || !draft.assetName}
              className="px-4 py-2 rounded-xl bg-success/20 text-success border border-success/30 text-[11px] font-black uppercase tracking-wider disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => { setShowForm(false); setDraft({ ...emptyDraft }); }}
              className="px-4 py-2 rounded-xl border border-white/10 text-[11px] font-black uppercase tracking-wider"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="glass-panel border border-white/10 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-[10px] uppercase tracking-wider text-textSecondary">
              <tr>
                {['Asset', 'Class', 'Cost', 'Monthly', 'Depreciated', 'Written down', ''].map((h) => (
                  <th key={h} className={`px-4 py-3 font-black ${h && h !== 'Asset' && h !== 'Class' ? 'text-right' : 'text-left'}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {assets.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-textSecondary">
                    <Package className="w-6 h-6 mx-auto mb-2 opacity-50" />
                    Nothing in the register yet.
                  </td>
                </tr>
              )}
              {assets.map((a) => (
                <tr key={a.id} className={a.disposedAt ? 'opacity-50' : ''}>
                  <td className="px-4 py-3">
                    <div className="font-semibold">{a.assetName}</div>
                    <div className="text-[11px] text-textSecondary">
                      {[a.serialNumber, a.vendor, a.purchaseDate].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-textSecondary">{a.assetClass}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(a.purchaseCost)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {a.depreciable ? money(a.monthlyDepreciation) : <span className="text-textSecondary">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {money(a.accumulatedPosted)}
                    {a.unpostedDepreciation > 0 && (
                      <div className="text-[10px] text-warning">+{money(a.unpostedDepreciation)} unposted</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold">{money(a.writtenDownValue)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {!a.disposedAt && (
                      <button
                        onClick={() => dispose(a)}
                        disabled={!canEdit}
                        title="Dispose"
                        className="p-1.5 rounded-lg border border-white/10 disabled:opacity-30"
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => remove(a)}
                      disabled={!canDelete}
                      title="Delete"
                      className="p-1.5 rounded-lg border border-white/10 text-danger ml-1.5 disabled:opacity-30"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
