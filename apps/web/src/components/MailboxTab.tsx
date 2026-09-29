import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Inbox, Send, FileEdit, Archive, ShieldAlert, Trash2,
  Loader2, Plus, Star, X, ChevronLeft, AlertCircle, Paperclip,
} from 'lucide-react';
import { API, authHeaders } from '../lib/auth';
import { errorMessage } from '../lib/errors';

/**
 * The mail client, mounted once per place mail is read.
 *
 * One component for every department and for personal mail, parameterised by
 * `scope` — the `DocumentsTab` pattern, and for the same reason: nine copies of a
 * thread list is nine places a fix has to land. The server decides which
 * mailboxes a scope resolves to, so this never chooses what the reader may see;
 * it renders what `/api/email/mine` returns and shows a Compose button only when
 * that response says `canSend`.
 *
 * HTML from an inbound message is deliberately never rendered. `bodyText` is what
 * a received message shows, with the raw source offered as a download — putting a
 * stranger's markup into this DOM is a scripting hole that no amount of
 * sanitising makes worth the risk, and a sandboxed iframe can come later if
 * plain text proves annoying.
 */

export type MailboxScope =
  | { kind: 'personal' }
  | { kind: 'app'; app: string }
  /**
   * Mail addressed to nobody in particular. Its own scope because the catch-all
   * belongs to no app and no person, so the other two both filtered it out and it
   * collected everything with no screen able to open it.
   */
  | { kind: 'catchall' };

interface MailboxTabProps {
  scope: MailboxScope;
  heading?: string;
  description?: string;
}

interface Mailbox {
  id: string;
  address: string;
  displayName: string | null;
  kind: string;
  appName: string | null;
  isActive: boolean;
  canSend: boolean;
  canBulk: boolean;
}

interface MessageSummary {
  id: string;
  threadId: string | null;
  direction: 'inbound' | 'outbound';
  folder: string;
  fromAddress: string;
  fromName: string | null;
  toAddresses: string;
  subject: string | null;
  preview: string;
  isRead: boolean;
  isStarred: boolean;
  spamVerdict: string | null;
  receivedAt: number | null;
  createdAt: number;
}

interface MessageDetail extends MessageSummary {
  bodyText: string;
  bodyHtml: string | null;
  ccAddresses: string | null;
  bccAddresses: string | null;
  rawKey: string | null;
  attachments: { id: string; filename: string; contentType: string | null; sizeBytes: number | null; url: string }[];
  delivery: { status: string; attempts: number; sentAt: number | null; errorCode: string | null; errorMessage: string | null } | null;
}

const FOLDERS = [
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'sent', label: 'Sent', icon: Send },
  { id: 'drafts', label: 'Drafts', icon: FileEdit },
  { id: 'archive', label: 'Archive', icon: Archive },
  { id: 'spam', label: 'Spam', icon: ShieldAlert },
  { id: 'trash', label: 'Trash', icon: Trash2 },
] as const;

/** `to_addresses` is stored as JSON. A malformed value renders as nothing rather than throwing. */
function addressList(json: string | null): string {
  if (!json) return '';
  try {
    const parsed = JSON.parse(json) as { email: string; name?: string }[];
    return parsed.map((a) => a.name || a.email).join(', ');
  } catch {
    return '';
  }
}

function when(ts: number | null): string {
  if (!ts) return '';
  const d = new Date(ts < 1e12 ? ts * 1000 : ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export default function MailboxTab({ scope, heading, description }: MailboxTabProps) {
  /**
   * `null` means "not loaded yet" for both lists, which is what removes the
   * separate loading flags — and with them the synchronous `setState` in an
   * effect body that `react-hooks/set-state-in-effect` rightly complains about.
   * It also reads better: a folder switch keeps the previous messages on screen
   * until the new ones arrive, rather than blanking to a spinner every time.
   */
  const [boxes, setBoxes] = useState<Mailbox[] | null>(null);
  const [activeBox, setActiveBox] = useState<string | null>(null);
  const [folder, setFolder] = useState<string>('inbox');
  const [messages, setMessages] = useState<MessageSummary[] | null>(null);
  const [open, setOpen] = useState<MessageDetail | null>(null);
  const [composing, setComposing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = scope.kind === 'personal' ? '?app=personal'
    : scope.kind === 'catchall' ? '?app=catchall'
    : `?app=${encodeURIComponent(scope.app)}`;
  const current = useMemo(() => boxes?.find((b) => b.id === activeBox) ?? null, [boxes, activeBox]);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/email/mine${query}`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const list: Mailbox[] = j.data ?? [];
        setBoxes(list);
        setActiveBox((prev) => (prev && list.some((b) => b.id === prev) ? prev : list[0]?.id ?? null));
      })
      .catch((e) => {
        if (cancelled) return;
        setError(errorMessage(e));
        setBoxes([]);
      });
    return () => { cancelled = true; };
  }, [query]);

  const loadMessages = useCallback(async (boxId: string, f: string) => {
    try {
      const res = await fetch(`${API}/email/mailboxes/${boxId}/messages?folder=${f}`, { headers: authHeaders() });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load messages');
      setMessages(json.data ?? []);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
      setMessages([]);
    }
  }, []);

  useEffect(() => {
    if (activeBox) loadMessages(activeBox, folder);
  }, [activeBox, folder, loadMessages]);

  async function openMessage(id: string) {
    try {
      const res = await fetch(`${API}/email/messages/${id}`, { headers: authHeaders() });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not open that message');
      setOpen(json.data);
      if (!json.data.isRead) {
        await fetch(`${API}/email/messages/${id}`, {
          method: 'PATCH',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ isRead: true }),
        });
        setMessages((prev) => (prev ?? []).map((m) => (m.id === id ? { ...m, isRead: true } : m)));
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function patchMessage(id: string, patch: Record<string, unknown>) {
    try {
      await fetch(`${API}/email/messages/${id}`, {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (patch.folder) {
        setMessages((prev) => (prev ?? []).filter((m) => m.id !== id));
        setOpen(null);
      } else {
        setMessages((prev) => (prev ?? []).map((m) => (m.id === id ? { ...m, ...patch } : m)));
        setOpen((o) => (o && o.id === id ? { ...o, ...patch } : o));
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (boxes === null) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-textSecondary" />
      </div>
    );
  }

  // No mailbox is the common first-run state, not an error — somebody with
  // `<app>/email` still has nothing to read until an administrator creates one.
  if (boxes.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <Inbox className="mx-auto mb-4 h-8 w-8 text-textSecondary" />
        <h3 className="mb-2 text-sm font-black uppercase tracking-widest text-textPrimary">No mailbox yet</h3>
        <p className="text-xs leading-relaxed text-textSecondary">
          {scope.kind === 'personal'
            ? 'You have not been assigned a personal mailbox. An administrator can create one for you on the Access page.'
            : scope.kind === 'catchall'
              ? 'No catch-all mailbox exists, so mail to an address nobody created is refused at the door rather than collected.'
              : `No mailbox has been created for ${scope.app}. An administrator can add one on the Access page.`}
        </p>
      </div>
    );
  }

  return (
    // No gutter of its own: every mount site is inside a <main> that already has
    // p-4/md:p-8, and adding px-4 here cost 32px of a 390px screen to padding.
    <div className="w-full">
      {(heading || description) && (
        <div className="mb-4">
          {heading && <h2 className="text-sm font-black uppercase tracking-widest text-textPrimary">{heading}</h2>}
          {description && <p className="mt-1 text-xs text-textSecondary">{description}</p>}
        </div>
      )}

      {/* Mailbox picker, only when there is a choice to make. */}
      {boxes.length > 1 && (
        <div className="scroll-x no-scrollbar mb-3 flex gap-2">
          {boxes.map((b) => (
            <button
              key={b.id}
              onClick={() => { setActiveBox(b.id); setOpen(null); }}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-all ${
                activeBox === b.id
                  ? 'border-module/40 bg-module/15 text-module'
                  : 'border-border bg-surfaceAlt text-textSecondary'
              }`}
            >
              {b.address}
              {!b.isActive && <span className="ml-1.5 text-warning">off</span>}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-col gap-3 md:flex-row">
        {/* Folder rail. A scrolling row on a phone, a column on a desktop —
            a six-item vertical list eats a third of a 390px screen. */}
        <div className="scroll-x no-scrollbar flex gap-1.5 md:w-40 md:shrink-0 md:flex-col">
          {current?.canSend && (
            <button
              onClick={() => setComposing(true)}
              className="mb-0 flex shrink-0 items-center gap-1.5 rounded-lg bg-module px-3 py-2 text-[11px] font-black uppercase tracking-wider text-onScrim transition-all active:scale-[0.97] md:mb-2 md:justify-center md:py-2.5"
            >
              <Plus className="h-3.5 w-3.5" /> Compose
            </button>
          )}
          {FOLDERS.map((f) => (
            <button
              key={f.id}
              onClick={() => { setFolder(f.id); setOpen(null); }}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-bold transition-all md:w-full ${
                folder === f.id ? 'bg-module/10 text-module' : 'text-textSecondary hover:bg-surfaceAlt'
              }`}
            >
              <f.icon className="h-3.5 w-3.5" />
              {f.label}
            </button>
          ))}
        </div>

        {/* List + reader. On a phone the reader replaces the list rather than
            sitting beside it; there is no width for both. */}
        <div className="min-w-0 flex-1">
          {open ? (
            <MessageView
              message={open}
              onBack={() => setOpen(null)}
              onStar={() => patchMessage(open.id, { isStarred: !open.isStarred })}
              onMove={(f) => patchMessage(open.id, { folder: f })}
            />
          ) : messages === null ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-4 w-4 animate-spin text-textSecondary" />
            </div>
          ) : messages.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface px-4 py-16 text-center">
              <p className="text-xs text-textSecondary">Nothing in {folder}.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-surface">
              {messages.map((m) => (
                <button
                  key={m.id}
                  onClick={() => openMessage(m.id)}
                  className={`flex w-full items-start gap-3 border-b border-border px-3 py-3 text-left transition-colors last:border-0 hover:bg-surfaceAlt md:px-4 ${
                    m.isRead ? '' : 'bg-module/[0.04]'
                  }`}
                >
                  <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center">
                    {m.isStarred
                      ? <Star className="h-3.5 w-3.5 fill-warning text-warning" />
                      : !m.isRead && <span className="h-1.5 w-1.5 rounded-full bg-module" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`truncate text-xs ${m.isRead ? 'text-textSecondary' : 'font-bold text-textPrimary'}`}>
                        {m.direction === 'outbound'
                          ? `To: ${addressList(m.toAddresses)}`
                          : (m.fromName || m.fromAddress)}
                      </span>
                      <span className="shrink-0 text-[10px] text-textSecondary">{when(m.receivedAt ?? m.createdAt)}</span>
                    </span>
                    <span className={`mt-0.5 block truncate text-xs ${m.isRead ? 'text-textSecondary' : 'text-textPrimary'}`}>
                      {m.subject || '(no subject)'}
                      {m.spamVerdict === 'spam' && (
                        <span className="ml-2 rounded bg-warning/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-warning">spam</span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-textSecondary">{m.preview}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {composing && current && (
        <Composer
          /**
           * Every mailbox in this scope the caller may send from, not just the one
           * being read. A department commonly has several — HR has `hr@` for
           * internal matters and `jobs@` for applicants — and which one a reply
           * comes from is part of writing it, not a consequence of which folder
           * you happened to be looking at.
           */
          mailboxes={boxes.filter((b) => b.canSend && b.isActive)}
          initial={current.canSend ? current.id : undefined}
          onClose={() => setComposing(false)}
          onSent={(sentFrom) => {
            setComposing(false);
            setFolder('sent');
            setActiveBox(sentFrom);
            loadMessages(sentFrom, 'sent');
          }}
        />
      )}
    </div>
  );
}

// ── Reader ──────────────────────────────────────────────────────────────────

function MessageView({
  message, onBack, onStar, onMove,
}: {
  message: MessageDetail;
  onBack: () => void;
  onStar: () => void;
  onMove: (folder: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5 md:px-4">
        <button onClick={onBack} className="rounded-lg p-1.5 text-textSecondary transition-colors hover:bg-surfaceAlt">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-0 flex-1 truncate text-xs font-bold text-textPrimary">
          {message.subject || '(no subject)'}
        </span>
        <button onClick={onStar} className="rounded-lg p-1.5 text-textSecondary transition-colors hover:bg-surfaceAlt">
          <Star className={`h-4 w-4 ${message.isStarred ? 'fill-warning text-warning' : ''}`} />
        </button>
        <button
          onClick={() => onMove('archive')}
          title="Archive"
          className="rounded-lg p-1.5 text-textSecondary transition-colors hover:bg-surfaceAlt"
        >
          <Archive className="h-4 w-4" />
        </button>
        <button
          onClick={() => onMove('trash')}
          title="Move to trash"
          className="rounded-lg p-1.5 text-textSecondary transition-colors hover:bg-surfaceAlt"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-1 border-b border-border px-3 py-3 text-[11px] md:px-4">
        <Row label="From" value={message.fromName ? `${message.fromName} <${message.fromAddress}>` : message.fromAddress} />
        <Row label="To" value={addressList(message.toAddresses)} />
        {message.ccAddresses && <Row label="Cc" value={addressList(message.ccAddresses)} />}
        {/* Bcc shows only on mail we sent — it is stored so the sent log can
            answer "who did this go to", and it is never part of a received
            message's visible headers. */}
        {message.direction === 'outbound' && message.bccAddresses && (
          <Row label="Bcc" value={addressList(message.bccAddresses)} />
        )}
        {message.delivery && (
          <Row
            label="Delivery"
            value={
              message.delivery.status === 'sent' ? 'Sent'
                : message.delivery.errorMessage
                  ? `${message.delivery.status} — ${message.delivery.errorMessage}`
                  : `${message.delivery.status} (attempt ${message.delivery.attempts})`
            }
          />
        )}
      </div>

      {/* Plain text only. See the component header: a stranger's HTML never
          enters this DOM. */}
      <pre className="whitespace-pre-wrap break-words px-3 py-4 text-xs leading-relaxed text-textPrimary md:px-4">
        {message.bodyText}
      </pre>

      {(message.attachments.length > 0 || (message.bodyHtml && message.direction === 'inbound')) && (
        <div className="flex flex-wrap gap-2 border-t border-border px-3 py-3 md:px-4">
          {message.attachments.map((a) => (
            <a
              key={a.id}
              href={a.url}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-surfaceAlt px-2.5 py-1.5 text-[11px] text-textPrimary transition-colors hover:border-module/40"
            >
              <Paperclip className="h-3 w-3 text-textSecondary" />
              {a.filename}
            </a>
          ))}
          {message.bodyHtml && message.direction === 'inbound' && message.rawKey && (
            <a
              href={`${API}/assets/download/${encodeURIComponent(message.rawKey)}`}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-surfaceAlt px-2.5 py-1.5 text-[11px] text-textSecondary transition-colors hover:border-module/40"
            >
              This message had an HTML part — download the original
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-14 shrink-0 font-bold uppercase tracking-wider text-textSecondary">{label}</span>
      <span className="min-w-0 break-words text-textPrimary">{value}</span>
    </div>
  );
}

// ── Composer ────────────────────────────────────────────────────────────────

interface Template {
  id: string;
  key: string;
  name: string;
  appName: string | null;
  subject: string;
  variables: string;
}

function Composer({
  mailboxes, initial, onClose, onSent,
}: {
  mailboxes: Mailbox[];
  initial?: string;
  onClose: () => void;
  onSent: (sentFrom: string) => void;
}) {
  const [fromId, setFromId] = useState(() => initial ?? mailboxes[0]?.id ?? '');
  const mailbox = mailboxes.find((b) => b.id === fromId) ?? mailboxes[0];
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Generated once per open composer, not per submit.
   *
   * This is what makes a double-clicked Send one message: the server keys the
   * outbox row on it, so the second request finds the first and returns the same
   * id instead of sending again.
   */
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    if (!mailbox || mailbox.kind !== 'app' || !mailbox.appName) return;
    fetch(`${API}/email/templates`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((j) => setTemplates((j.data ?? []).filter((t: Template) => t.appName === mailbox.appName)))
      .catch(() => setTemplates([]));
  }, [mailbox?.kind, mailbox?.appName]);

  const split = (v: string) => v.split(/[,;\s]+/).map((s) => s.trim()).filter((s) => s.includes('@'));
  const recipientCount = split(to).length + split(cc).length + split(bcc).length;

  async function submit() {
    if (!mailbox) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`${API}/email/send`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mailboxId: mailbox.id,
          to: split(to),
          cc: split(cc),
          bcc: split(bcc),
          subject,
          text,
          idempotencyKey,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not send');
      onSent(mailbox.id);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  const overBulk = recipientCount > 10 && !mailbox?.canBulk;

  // Nothing to send from. The Compose button is only rendered when there is,
  // but a mailbox can be deactivated between the two.
  if (!mailbox) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="sheet flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-surface sm:max-w-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-xs font-black uppercase tracking-widest text-textPrimary">New message</h3>
            {mailboxes.length > 1 ? (
              <label className="mt-0.5 flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-textSecondary">From</span>
                <select
                  value={fromId}
                  onChange={(e) => setFromId(e.target.value)}
                  className="min-w-0 max-w-full truncate rounded border border-border bg-surfaceAlt px-1.5 py-0.5 text-[11px] text-textPrimary outline-none"
                >
                  {mailboxes.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.displayName ? `${b.displayName} <${b.address}>` : b.address}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="truncate text-[11px] text-textSecondary">from {mailbox.address}</p>
            )}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-textSecondary transition-colors hover:bg-surfaceAlt">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
          <Field label="To" value={to} onChange={setTo} placeholder="someone@example.com, another@example.com" />
          {showCc ? (
            <>
              <Field label="Cc" value={cc} onChange={setCc} placeholder="" />
              <Field label="Bcc" value={bcc} onChange={setBcc} placeholder="" />
            </>
          ) : (
            <button onClick={() => setShowCc(true)} className="text-[11px] font-bold text-module">
              Add Cc / Bcc
            </button>
          )}

          {templates.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-textSecondary">Template</span>
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSubject(t.subject)}
                  className="rounded-full border border-border bg-surfaceAlt px-2.5 py-1 text-[11px] text-textSecondary transition-colors hover:border-module/40"
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}

          <Field label="Subject" value={subject} onChange={setSubject} placeholder="" />
          {/* Sized by class rather than `rows`, so a phone with the keyboard up —
              where the visible sheet is a few hundred pixels tall — does not give
              the body ten rows and push Send off the bottom. */}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write your message…"
            className="min-h-[7rem] w-full resize-y rounded-lg border border-border bg-surfaceAlt px-3 py-2 text-textPrimary outline-none transition-colors focus:border-module/50 md:min-h-[14rem]"
          />

          {overBulk && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[11px] text-warning">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {recipientCount} recipients. Sending to more than 10 at once needs bulk permission on this
                mailbox — ask an administrator, or send in smaller batches.
              </span>
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-[11px] text-danger">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
          <span className="text-[10px] text-textSecondary">
            {recipientCount > 0 && `${recipientCount} recipient${recipientCount === 1 ? '' : 's'}`}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-border px-3 py-2 text-[11px] font-bold text-textSecondary transition-colors hover:bg-surfaceAlt"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={sending || recipientCount === 0 || !subject.trim() || !text.trim() || overBulk}
              className="flex items-center gap-1.5 rounded-lg bg-module px-4 py-2 text-[11px] font-black uppercase tracking-wider text-onScrim transition-all active:scale-[0.97] disabled:opacity-40"
            >
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="flex items-center gap-2 border-b border-border py-1.5">
      <span className="w-12 shrink-0 text-[10px] font-bold uppercase tracking-wider text-textSecondary">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-textPrimary outline-none placeholder:text-textSecondary/50"
      />
    </label>
  );
}
