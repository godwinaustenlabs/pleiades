import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Loader2, Save, Send, Settings2, Inbox, Check, X, AlertTriangle, Eye,
  BookOpen, RefreshCw, Trash2, Search, Upload,
} from 'lucide-react';
import { API, authHeaders } from '../lib/auth';
import { errorMessage } from '../lib/errors';
import MarkdownView from './MarkdownView';

interface ConfigVar {
  key: string;
  group: string;
  label: string;
  description: string | null;
  valueType: 'percent' | 'currency' | 'number' | 'date' | 'text' | 'boolean' | 'json';
  unit: string | null;
  value: string | null;
  required: boolean;
}
interface ConfigGroup { key: string; label: string; vars: ConfigVar[] }
interface Approval { id: string; toolName: string; summary: string; payload: unknown; createdAt: string }
interface ChatMessage { role: 'user' | 'assistant'; text: string }
interface KnowledgeDoc {
  id: string; r2Key: string; title: string; chunkCount: number;
  status: 'pending' | 'indexed' | 'failed'; error: string | null;
}
interface BucketObject { key: string; size: number; uploaded: string }

type Tab = 'chat' | 'settings' | 'approvals';

interface AccountantPanelProps {
  /** finance/agent edit — may drive the agent and decide approvals. */
  canDrive: boolean;
  /** finance/agent_config edit — may change the rates it quotes. */
  canEditConfig: boolean;
}

/**
 * The Pleiades accountant, as a tab inside Accounting.
 *
 * Three things in one place because they are the same job: tell the agent what
 * the law currently is (settings), ask it to do something (chat), and decide
 * what it refuses to decide alone (approvals). It lives here rather than in an
 * app of its own — the people who use it are the people already working these
 * ledgers, and the settings belong next to the accounts they govern.
 */
export default function AccountantPanel({ canDrive, canEditConfig }: AccountantPanelProps) {
  const [tab, setTab] = useState<Tab>('chat');

  const [groups, setGroups] = useState<ConfigGroup[]>([]);
  const [missing, setMissing] = useState<{ key: string; label: string }[]>([]);
  const [edits, setEdits] = useState<Record<string, string | null>>({});
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [unindexed, setUnindexed] = useState<BucketObject[]>([]);
  const [kbReady, setKbReady] = useState({ vectorize: false, bucket: false });
  const [ingesting, setIngesting] = useState<string | null>(null);
  const [probe, setProbe] = useState('');
  const [probeResult, setProbeResult] = useState<any>(null);
  const [showKnowledge, setShowKnowledge] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const loadConfig = useCallback(async () => {
    const res = await fetch(`${API}/finance/agent/config`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Could not load settings (${res.status})`);
    const { data } = await res.json();
    setGroups(data.groups || []);
    setMissing(data.missingRequired || []);
  }, []);

  const loadApprovals = useCallback(async () => {
    const res = await fetch(`${API}/finance/agent/approvals`, { headers: authHeaders() });
    if (!res.ok) return;
    const { data } = await res.json();
    setApprovals(data || []);
  }, []);

  const loadKnowledge = useCallback(async () => {
    const res = await fetch(`${API}/finance/agent/knowledge`, { headers: authHeaders() });
    if (!res.ok) return;
    const { data } = await res.json();
    setDocs(data.documents || []);
    setUnindexed(data.unindexed || []);
    setKbReady({ vectorize: !!data.vectorizeConfigured, bucket: !!data.bucketConfigured });
  }, []);

  async function upload(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    setError(null); setNotice(null);
    for (const file of list) {
      setIngesting(file.name);
      try {
        const res = await fetch(
          `${API}/finance/agent/knowledge/upload?filename=${encodeURIComponent(file.name)}`,
          {
            method: 'POST',
            headers: { ...authHeaders(), 'Content-Type': file.type || 'application/octet-stream' },
            body: file,
          },
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error || `Upload failed (${res.status})`);
        setNotice(`${file.name} — indexed into ${body.data.chunks} passages.`);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setIngesting(null);
      }
    }
    await loadKnowledge();
  }

  async function ingest(r2Key: string) {
    setIngesting(r2Key); setError(null); setNotice(null);
    try {
      const res = await fetch(`${API}/finance/agent/knowledge/ingest`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ r2Key }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Indexing failed (${res.status})`);
      setNotice(`Indexed ${body.data.title} — ${body.data.chunks} passages.`);
      await loadKnowledge();
    } catch (e) { setError(errorMessage(e)); } finally { setIngesting(null); }
  }

  async function removeDoc(id: string) {
    try {
      const res = await fetch(`${API}/finance/agent/knowledge/${id}`, {
        method: 'DELETE', headers: authHeaders(),
      });
      if (!res.ok) throw new Error('Could not remove that document');
      await loadKnowledge();
    } catch (e) { setError(errorMessage(e)); }
  }

  async function runProbe() {
    if (!probe.trim()) return;
    try {
      const res = await fetch(`${API}/finance/agent/knowledge/search?q=${encodeURIComponent(probe)}`, {
        headers: authHeaders(),
      });
      const { data } = await res.json();
      setProbeResult(data);
    } catch (e) { setError(errorMessage(e)); }
  }

  useEffect(() => {
    Promise.all([loadConfig(), loadApprovals(), loadKnowledge()])
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [loadConfig, loadApprovals, loadKnowledge]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function saveConfig() {
    setSaving(true); setError(null); setNotice(null);
    try {
      const res = await fetch(`${API}/finance/agent/config`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: edits }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Save failed (${res.status})`);
      setEdits({});
      await loadConfig();
      setNotice(
        body.data?.missingRequired
          ? `Saved. ${body.data.missingRequired} required setting(s) still unset.`
          : 'Saved — everything required is configured.',
      );
    } catch (e) { setError(errorMessage(e)); } finally { setSaving(false); }
  }

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft(''); setError(null);
    setMessages((m) => [...m, { role: 'user', text }]);
    setSending(true);
    try {
      const res = await fetch(`${API}/finance/agent/chat`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `The agent could not answer (${res.status})`);
      setMessages((m) => [...m, { role: 'assistant', text: body.data.reply }]);
      if (body.data.pendingApprovals?.length) await loadApprovals();
    } catch (e) {
      setError(errorMessage(e));
      setMessages((m) => [...m, { role: 'assistant', text: `_Could not complete that turn._` }]);
    } finally { setSending(false); }
  }

  async function decide(id: string, decision: 'approved' | 'rejected') {
    try {
      const res = await fetch(`${API}/finance/agent/approvals/${id}`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Failed');
      await loadApprovals();
      setNotice(
        decision === 'approved'
          ? 'Approved. Tell the agent to go ahead — it needs the approval id to proceed.'
          : 'Rejected.',
      );
    } catch (e) { setError(errorMessage(e)); }
  }

  async function showPreview() {
    try {
      const res = await fetch(`${API}/finance/agent/config/preview`, { headers: authHeaders() });
      const { data } = await res.json();
      setPreview(data.prompt);
    } catch (e) { setError(errorMessage(e)); }
  }

  const valueOf = (v: ConfigVar) => (v.key in edits ? edits[v.key] : v.value) ?? '';
  const setValue = (k: string, val: string) =>
    setEdits((e) => ({ ...e, [k]: val === '' ? null : val }));
  const dirty = Object.keys(edits).length > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-textSecondary text-xs">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[10px] text-textSecondary uppercase tracking-wider">
        Drafts for review — the accountant does not file anything
      </p>

      {missing.length > 0 && (
        <div className="flex items-start gap-2 border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs px-3 py-2 rounded">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <strong>{missing.length} required setting{missing.length === 1 ? '' : 's'} unset.</strong>{' '}
            The agent will refuse any figure that depends on {missing.length === 1 ? 'it' : 'them'} rather than guess.
            <button onClick={() => setTab('settings')} className="ml-1 underline font-bold">Configure</button>
          </div>
        </div>
      )}

      {error && <div className="border border-red-500/40 bg-red-500/10 text-red-500 text-xs px-3 py-2 rounded">{error}</div>}
      {notice && <div className="border border-primary/40 bg-primary/10 text-primary text-xs px-3 py-2 rounded">{notice}</div>}

      <div className="flex gap-1 border-b border-border">
        {([['chat', 'Chat', Send], ['settings', 'Compliance settings', Settings2], ['approvals', `Approvals${approvals.length ? ` (${approvals.length})` : ''}`, Inbox]] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id as Tab)}
            className={`flex items-center gap-1.5 px-3 py-2 text-[10px] font-black uppercase tracking-wider border-b-2 -mb-px ${
              tab === id ? 'border-primary text-primary' : 'border-transparent text-textSecondary hover:text-text'
            }`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {tab === 'chat' && (
        <div className="space-y-3">
          {/* What the agent knows, and how to give it more — kept next to the
              conversation, because "why doesn't it know this?" is a question you
              ask mid-chat, not in a settings screen. */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); if (canEditConfig) upload(e.dataTransfer.files); }}
            className={`border rounded-lg transition-colors ${dragging ? 'border-primary bg-primary/5' : 'border-border'}`}
          >
            <div className="flex items-center gap-2 px-3 py-2">
              <BookOpen className="w-3.5 h-3.5 text-textSecondary shrink-0" />
              <button
                onClick={() => setShowKnowledge((v) => !v)}
                className="text-[10px] font-black uppercase tracking-wider hover:text-primary"
              >
                Knowledge base
              </button>
              <span className="text-[10px] text-textSecondary truncate">
                {!kbReady.vectorize || !kbReady.bucket
                  ? 'not configured'
                  : docs.length === 0
                    ? 'no documents — the agent answers from settings alone'
                    : `${docs.length} document${docs.length === 1 ? '' : 's'}, ${docs.reduce((n, d) => n + d.chunkCount, 0)} passages`}
              </span>
              <div className="ml-auto flex items-center gap-1.5 shrink-0">
                {ingesting && (
                  <span className="flex items-center gap-1 text-[10px] text-textSecondary">
                    <Loader2 className="w-3 h-3 animate-spin" /> indexing {ingesting}
                  </span>
                )}
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.md,.markdown,.txt,.html,.htm,.csv"
                  className="hidden"
                  onChange={(e) => { if (e.target.files) upload(e.target.files); e.target.value = ''; }}
                />
                <button
                  onClick={() => fileInput.current?.click()}
                  disabled={!canEditConfig || !!ingesting}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-primary text-white text-[10px] font-black uppercase tracking-wider disabled:opacity-40"
                >
                  <Upload className="w-3 h-3" /> Add document
                </button>
              </div>
            </div>

            {showKnowledge && (
              <div className="border-t border-border divide-y divide-border">
                {docs.length === 0 && unindexed.length === 0 && (
                  <div className="px-3 py-4 text-[11px] text-textSecondary">
                    Drop a file here, or use Add document. PDF, DOCX, MD, TXT, HTML and CSV are
                    converted, split on headings and indexed automatically.
                  </div>
                )}
                {docs.map((d) => (
                  <div key={d.id} className="px-3 py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold truncate">{d.title}</div>
                      <div className="text-[10px] text-textSecondary truncate">
                        {d.status === 'indexed' ? `${d.chunkCount} passages` : d.status === 'failed' ? d.error : 'pending'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => ingest(d.r2Key)} disabled={!canEditConfig || !!ingesting} title="Re-index" className="p-1 rounded border border-border disabled:opacity-40">
                        <RefreshCw className="w-3 h-3" />
                      </button>
                      <button onClick={() => removeDoc(d.id)} disabled={!canEditConfig} title="Remove" className="p-1 rounded border border-border text-red-500 disabled:opacity-40">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
                {unindexed.map((o) => (
                  <div key={o.key} className="px-3 py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold truncate">{o.key}</div>
                      <div className="text-[10px] text-amber-500">in the bucket, not indexed</div>
                    </div>
                    <button onClick={() => ingest(o.key)} disabled={!canEditConfig || !!ingesting} className="px-2 py-1 rounded bg-primary text-white text-[10px] font-black uppercase tracking-wider disabled:opacity-40 shrink-0">
                      Index
                    </button>
                  </div>
                ))}
                <div className="px-3 py-2 flex gap-2">
                  <input
                    value={probe}
                    onChange={(e) => setProbe(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && runProbe()}
                    placeholder="Search what the agent can see…"
                    className="flex-1 border border-border rounded px-2 py-1 text-[11px] bg-transparent"
                  />
                  <button onClick={runProbe} className="px-2 rounded border border-border"><Search className="w-3 h-3" /></button>
                </div>
                {probeResult?.passages?.length > 0 && (
                  <div className="px-3 py-2 space-y-1.5">
                    {probeResult.passages.slice(0, 3).map((p: any, i: number) => (
                      <div key={i} className="text-[10px]">
                        <span className="font-black uppercase tracking-wider text-primary">
                          {p.title} › {p.section}
                        </span>
                        <div className="text-textSecondary line-clamp-2">{p.text}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border border-border rounded-lg p-4 min-h-[45vh] max-h-[60vh] overflow-y-auto space-y-4">
            {messages.length === 0 && (
              <div className="text-xs text-textSecondary py-10 text-center space-y-2">
                <p>Ask it about payroll, ledgers, journals or a filing.</p>
                <p className="opacity-70">
                  It reads your compliance settings for every rate, and asks before changing anything.
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
                <div className={`inline-block text-left max-w-[85%] px-3 py-2 rounded-xl ${
                  m.role === 'user' ? 'bg-primary text-white' : 'bg-surfaceAlt'
                }`}>
                  {m.role === 'assistant'
                    ? <div className="text-sm"><MarkdownView source={m.text} /></div>
                    : <div className="text-sm whitespace-pre-wrap">{m.text}</div>}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex items-center gap-2 text-xs text-textSecondary">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Working…
              </div>
            )}
            <div ref={endRef} />
          </div>
          <div className="flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
              disabled={!canDrive || sending}
              placeholder={canDrive ? 'Ask the accountant…' : 'You need agent / reports (edit) to drive the agent'}
              className="flex-1 border border-border rounded-lg px-3 py-2 text-sm bg-transparent outline-none focus:border-primary disabled:opacity-50"
            />
            <button
              onClick={send}
              disabled={!canDrive || sending || !draft.trim()}
              className="px-4 rounded-lg bg-primary text-white text-[10px] font-black uppercase tracking-wider disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </div>
      )}

      {tab === 'settings' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-textSecondary max-w-2xl">
              Every rate the agent quotes comes from here. Leave a field blank and it will say so
              rather than supply a figure of its own.
            </p>
            <div className="flex gap-2 shrink-0">
              <button onClick={showPreview} className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border text-[10px] font-black uppercase tracking-wider">
                <Eye className="w-3.5 h-3.5" /> Preview prompt
              </button>
              <button
                onClick={saveConfig}
                disabled={!canEditConfig || saving || !dirty}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-white text-[10px] font-black uppercase tracking-wider disabled:opacity-40"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {saving ? 'Saving' : dirty ? 'Save changes' : 'Saved'}
              </button>
            </div>
          </div>

          {groups.map((g) => (
            <div key={g.key} className="border border-border rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-surfaceAlt text-[11px] font-black uppercase tracking-wider">{g.label}</div>
              <div className="divide-y divide-border">
                {g.vars.map((v) => {
                  const unset = !valueOf(v);
                  return (
                    <div key={v.key} className="px-3 py-2.5 grid grid-cols-1 md:grid-cols-[1fr_320px] gap-2 items-start">
                      <div>
                        <div className="text-xs font-bold flex items-center gap-1.5">
                          {v.label}
                          {v.required && unset && (
                            <span className="text-[9px] font-black uppercase tracking-wider text-amber-500">required</span>
                          )}
                        </div>
                        {v.description && <div className="text-[10px] text-textSecondary mt-0.5">{v.description}</div>}
                      </div>
                      {v.valueType === 'boolean' ? (
                        <select
                          value={valueOf(v) || 'false'}
                          disabled={!canEditConfig}
                          onChange={(e) => setValue(v.key, e.target.value)}
                          className="border border-border rounded px-2 py-1.5 text-xs bg-transparent"
                        >
                          <option value="true">Yes</option>
                          <option value="false">No</option>
                        </select>
                      ) : v.valueType === 'json' ? (
                        <textarea
                          value={valueOf(v)}
                          disabled={!canEditConfig}
                          onChange={(e) => setValue(v.key, e.target.value)}
                          rows={4}
                          spellCheck={false}
                          placeholder={v.key === 'salary_withholding_slabs'
                            ? '[{"from":0,"to":600000,"rate_pct":0},{"from":600000,"to":1200000,"rate_pct":5}]'
                            : 'JSON'}
                          className={`border rounded px-2 py-1.5 text-[11px] font-mono bg-transparent ${unset && v.required ? 'border-amber-500/50' : 'border-border'}`}
                        />
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <input
                            value={valueOf(v)}
                            disabled={!canEditConfig}
                            onChange={(e) => setValue(v.key, e.target.value)}
                            placeholder={v.valueType === 'date' ? 'MM-DD' : v.valueType === 'percent' ? '0–100' : ''}
                            className={`flex-1 border rounded px-2 py-1.5 text-xs bg-transparent ${unset && v.required ? 'border-amber-500/50' : 'border-border'}`}
                          />
                          {v.unit && <span className="text-[10px] text-textSecondary w-10">{v.unit}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'approvals' && (
        <div className="space-y-3">
          <p className="text-xs text-textSecondary">
            The agent stops rather than take these alone. Approving authorises exactly the change
            described — if the details change, it has to ask again.
          </p>
          {approvals.length === 0 && (
            <div className="border border-border rounded-lg py-10 text-center text-xs text-textSecondary">
              Nothing waiting.
            </div>
          )}
          {approvals.map((a) => (
            <div key={a.id} className="border border-border rounded-lg p-4 space-y-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-textSecondary">{a.toolName}</div>
                <div className="text-sm font-bold mt-1">{a.summary}</div>
              </div>
              <pre className="text-[10px] font-mono bg-surfaceAlt rounded p-2 overflow-x-auto">
                {JSON.stringify(a.payload, null, 2)}
              </pre>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => decide(a.id, 'approved')}
                  disabled={!canDrive}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-white text-[10px] font-black uppercase tracking-wider disabled:opacity-40"
                >
                  <Check className="w-3.5 h-3.5" /> Approve
                </button>
                <button
                  onClick={() => decide(a.id, 'rejected')}
                  disabled={!canDrive}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border text-[10px] font-black uppercase tracking-wider disabled:opacity-40"
                >
                  <X className="w-3.5 h-3.5" /> Reject
                </button>
                <code className="text-[10px] text-textSecondary ml-auto">{a.id}</code>
              </div>
            </div>
          ))}
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className="bg-surface border border-border rounded-xl max-w-3xl w-full max-h-[80vh] overflow-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="text-[11px] font-black uppercase tracking-wider mb-3">
              What the agent reads
            </div>
            <pre className="text-[11px] font-mono whitespace-pre-wrap">{preview}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
