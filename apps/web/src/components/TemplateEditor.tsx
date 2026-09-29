import { useCallback, useEffect, useState } from 'react';
import { FileText, Loader2, Plus, Trash2, AlertCircle, Check, X, Save } from 'lucide-react';
import { API, authHeaders } from '../lib/auth';
import { errorMessage } from '../lib/errors';

/**
 * Editing the templates a department sends from.
 *
 * The API had been complete since the subsystem was built — create, edit, validate,
 * delete, with scope filtering — and there was no screen, so a template could only be
 * created by a migration. The composer could apply one's subject and nothing else.
 *
 * Two rules the server enforces and this surfaces rather than duplicates:
 *
 *  - **An undeclared `{{placeholder}}` is rejected when the template is SAVED**, not
 *    when it is sent. A typo caught by the person editing beats a blank arriving in a
 *    client's inbox months later. The server returns every problem at once, so they are
 *    shown together rather than one reload at a time.
 *  - **A `scope='system'` template cannot be edited here or deleted at all.** Those back
 *    automated mail — the password reset, the task notification — and reach everybody.
 *    They are listed read-only so it is clear they exist.
 */

interface TemplateVar {
  name: string;
  label: string;
  required?: boolean;
}

interface Template {
  id: string;
  key: string;
  scope: 'system' | 'app';
  appName: string | null;
  name: string;
  description: string | null;
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  variables: string;
  isActive: boolean;
}

interface Draft {
  id?: string;
  key: string;
  name: string;
  description: string;
  subject: string;
  bodyText: string;
  variables: TemplateVar[];
}

const EMPTY: Draft = { key: '', name: '', description: '', subject: '', bodyText: '', variables: [] };

function parseVars(json: string): TemplateVar[] {
  try {
    const p = JSON.parse(json);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

/** Every `{{name}}` in the text, so the editor can offer to declare what is missing. */
function placeholdersIn(...parts: string[]): string[] {
  const seen: string[] = [];
  for (const part of parts) {
    for (const m of (part || '').matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)) {
      if (!seen.includes(m[1])) seen.push(m[1]);
    }
  }
  return seen;
}

export default function TemplateEditor({ app }: { app: string }) {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/email/templates`, { headers: authHeaders() });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load templates');
      setTemplates(json.data ?? []);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
      setTemplates([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!editing) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const isNew = !editing.id;
      const res = await fetch(`${API}/email/templates${isNew ? '' : `/${editing.id}`}`, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isNew ? { appName: app, key: editing.key } : {}),
          name: editing.name,
          description: editing.description,
          subject: editing.subject,
          bodyText: editing.bodyText,
          variables: editing.variables,
        }),
      });
      const json = await res.json();
      // The server collects every validation problem into one message rather than
      // failing on the first, so this is shown whole.
      if (!res.ok) throw new Error(json.error || 'Could not save');
      setNotice('Saved.');
      setEditing(null);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(t: Template) {
    if (!confirm(`Delete the template “${t.name}”? Anything already sent is unaffected.`)) return;
    try {
      const res = await fetch(`${API}/email/templates/${t.id}`, { method: 'DELETE', headers: authHeaders() });
      if (!res.ok) throw new Error((await res.json()).error || 'Could not delete');
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (templates === null) {
    return (
      <div className="flex items-center gap-2 py-12 text-xs text-textSecondary">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading templates…
      </div>
    );
  }

  const mine = templates.filter((t) => t.scope === 'app' && t.appName === app);
  const system = templates.filter((t) => t.scope === 'system');

  const undeclared = editing
    ? placeholdersIn(editing.subject, editing.bodyText).filter((p) => !editing.variables.some((v) => v.name === p))
    : [];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black uppercase tracking-widest text-textPrimary">Templates</h3>
          <p className="mt-1 text-xs leading-relaxed text-textSecondary">
            Reusable messages for {app}. Write <code className="text-textPrimary">{'{{name}}'}</code> where a value goes,
            and declare it below — a placeholder nothing fills in is rejected when you save rather than
            arriving blank in somebody&rsquo;s inbox.
          </p>
        </div>
        {!editing && (
          <button
            onClick={() => setEditing({ ...EMPTY })}
            className="shrink-0 flex items-center gap-1.5 rounded-lg bg-module px-3 py-2 text-[11px] font-black uppercase tracking-wider text-onScrim transition-all active:scale-[0.97]"
          >
            <Plus className="h-3.5 w-3.5" /> New
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {editing && (
        <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black uppercase tracking-widest text-textPrimary">
              {editing.id ? 'Edit template' : 'New template'}
            </h4>
            <button onClick={() => setEditing(null)} className="rounded-lg p-1 text-textSecondary hover:bg-surfaceAlt">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Labelled label="Name">
              <input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="Introduction"
                className="w-full rounded border border-border bg-surfaceAlt px-2 py-1.5 text-textPrimary outline-none"
              />
            </Labelled>
            <Labelled label="Key">
              <input
                value={editing.key}
                onChange={(e) => setEditing({ ...editing, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                disabled={!!editing.id}
                placeholder="intro_email"
                className="w-full rounded border border-border bg-surfaceAlt px-2 py-1.5 font-mono text-textPrimary outline-none disabled:opacity-50"
              />
              {editing.id && (
                // Code looks a template up by key, so changing it would break whatever
                // referenced it — silently, at send time.
                <span className="mt-1 block text-[10px] text-textSecondary">Fixed once created.</span>
              )}
            </Labelled>
          </div>

          <Labelled label="Description">
            <input
              value={editing.description}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              placeholder="What this is for, and when to use it"
              className="w-full rounded border border-border bg-surfaceAlt px-2 py-1.5 text-textPrimary outline-none"
            />
          </Labelled>

          <Labelled label="Subject">
            <input
              value={editing.subject}
              onChange={(e) => setEditing({ ...editing, subject: e.target.value })}
              placeholder="A note from {{company}}"
              className="w-full rounded border border-border bg-surfaceAlt px-2 py-1.5 text-textPrimary outline-none"
            />
          </Labelled>

          <Labelled label="Message">
            <textarea
              value={editing.bodyText}
              onChange={(e) => setEditing({ ...editing, bodyText: e.target.value })}
              placeholder={'Hi {{firstName}},\n\n…'}
              className="min-h-[9rem] w-full resize-y rounded border border-border bg-surfaceAlt px-2 py-1.5 text-textPrimary outline-none md:min-h-[12rem]"
            />
          </Labelled>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-textSecondary">Variables</span>
              {undeclared.length > 0 && (
                <button
                  onClick={() => setEditing({
                    ...editing,
                    variables: [
                      ...editing.variables,
                      ...undeclared.map((n) => ({ name: n, label: n, required: true })),
                    ],
                  })}
                  className="text-[11px] font-bold text-module"
                >
                  Declare {undeclared.join(', ')}
                </button>
              )}
            </div>

            {editing.variables.length === 0 ? (
              <p className="text-[11px] text-textSecondary">
                None yet. Anything you write as <code>{'{{name}}'}</code> needs declaring here.
              </p>
            ) : (
              <div className="space-y-1.5">
                {editing.variables.map((v, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <span className="min-w-[7rem] font-mono text-[11px] text-textPrimary">{`{{${v.name}}}`}</span>
                    <input
                      value={v.label}
                      onChange={(e) => {
                        const next = [...editing.variables];
                        next[i] = { ...v, label: e.target.value };
                        setEditing({ ...editing, variables: next });
                      }}
                      placeholder="What the sender sees"
                      className="min-w-0 flex-1 rounded border border-border bg-surfaceAlt px-2 py-1 text-[11px] text-textPrimary outline-none"
                    />
                    <label className="flex shrink-0 items-center gap-1 text-[11px] text-textSecondary">
                      <input
                        type="checkbox"
                        checked={v.required !== false}
                        onChange={(e) => {
                          const next = [...editing.variables];
                          next[i] = { ...v, required: e.target.checked };
                          setEditing({ ...editing, variables: next });
                        }}
                      />
                      required
                    </label>
                    <button
                      onClick={() => setEditing({ ...editing, variables: editing.variables.filter((_, j) => j !== i) })}
                      className="shrink-0 text-textSecondary"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setEditing(null)} className="rounded-lg border border-border px-3 py-2 text-[11px] font-bold text-textSecondary">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={busy || !editing.key || !editing.name || !editing.subject || !editing.bodyText}
              className="flex items-center gap-1.5 rounded-lg bg-module px-4 py-2 text-[11px] font-black uppercase tracking-wider text-onScrim disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
            </button>
          </div>
        </div>
      )}

      {mine.length === 0 && !editing ? (
        <div className="rounded-xl border border-border bg-surface px-4 py-12 text-center">
          <FileText className="mx-auto mb-3 h-8 w-8 text-textSecondary opacity-40" />
          <p className="text-xs text-textSecondary">No templates for {app} yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          {mine.map((t) => (
            <div key={t.id} className="flex items-start gap-3 border-b border-border p-3 last:border-0 md:p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-xs font-bold text-textPrimary">{t.name}</span>
                  <span className="font-mono text-[10px] text-textSecondary">{t.key}</span>
                  {!t.isActive && <span className="text-[9px] font-black uppercase text-warning">off</span>}
                </div>
                {t.description && <p className="mt-0.5 text-[11px] text-textSecondary">{t.description}</p>}
                <p className="mt-0.5 truncate text-[11px] text-textSecondary">Subject: {t.subject}</p>
                {parseVars(t.variables).length > 0 && (
                  <p className="mt-0.5 font-mono text-[10px] text-textSecondary">
                    {parseVars(t.variables).map((v) => `{{${v.name}}}`).join(' ')}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => setEditing({
                    id: t.id, key: t.key, name: t.name, description: t.description ?? '',
                    subject: t.subject, bodyText: t.bodyText, variables: parseVars(t.variables),
                  })}
                  className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-textSecondary hover:bg-surfaceAlt"
                >
                  Edit
                </button>
                <button onClick={() => remove(t)} className="rounded-lg p-1.5 text-textSecondary hover:bg-surfaceAlt">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {system.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-[10px] font-black uppercase tracking-widest text-textSecondary">
            Automated mail
          </h4>
          <p className="mb-2 text-[11px] leading-relaxed text-textSecondary">
            These back things the system sends by itself and reach everybody, so they are edited on the
            Access page under Automations rather than here — and cannot be deleted, because deleting one
            stops the mail it carries without anything saying so.
          </p>
          <div className="overflow-hidden rounded-xl border border-border bg-surface opacity-70">
            {system.map((t) => (
              <div key={t.id} className="border-b border-border p-3 last:border-0">
                <span className="font-mono text-[11px] text-textPrimary">{t.key}</span>
                <p className="mt-0.5 truncate text-[11px] text-textSecondary">Subject: {t.subject}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-textSecondary">{label}</span>
      {children}
    </label>
  );
}
