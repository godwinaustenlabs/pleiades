import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Inbox, Send, FileEdit, Archive, ShieldAlert, Trash2, Loader2, Plus, Star, X,
  ChevronLeft, AlertCircle, Paperclip, Reply, ReplyAll, Forward, Search, Bell,
  MailOpen, RefreshCw, CornerUpLeft, Clock, Download, FileText, Type,
} from 'lucide-react';
import { API, authHeaders } from '../lib/auth';
import { errorMessage } from '../lib/errors';
import TemplateEditor from './TemplateEditor';
import { MailHtml, type InlineAttachment } from './MailHtml';
import RichText from './RichText';

/**
 * The mail client, mounted once per place mail is read.
 *
 * One component for every department and for personal mail, parameterised by `scope` —
 * the `DocumentsTab` pattern, and for the same reason: nine copies of a thread list is
 * nine places a fix has to land. The server decides which mailboxes a scope resolves
 * to, so this never chooses what the reader may see; it renders what `/api/email/mine`
 * returns and shows a Compose button only when that response says `canSend`.
 *
 * Three things here are deliberate and easy to undo by accident:
 *
 *  - **HTML from an inbound message is never rendered.** `bodyText` is what a received
 *    message shows, with the raw source offered as a download. Putting a stranger's
 *    markup into this DOM is a scripting hole no amount of sanitising makes worth it.
 *  - **Reply builds its headers server-side.** The composer sends `replyTo: <messageId>`
 *    and the route derives In-Reply-To and References from the stored parent. A client
 *    that supplied them freely could graft a message onto any conversation.
 *  - **A draft exists before its attachments do.** An attachment needs a message id, so
 *    choosing a file autosaves the draft first. That is also what keeps the attachment
 *    upload route off `/api/assets/upload`, whose prefix allowlist must never include
 *    the one that holds received mail.
 */

export type MailboxScope =
  | { kind: 'personal' }
  | { kind: 'app'; app: string }
  /**
   * Mail addressed to nobody in particular. Its own scope because the catch-all belongs
   * to no app and no person, so the other two both filtered it out and it collected
   * everything with no screen able to open it.
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
  spamVerdict?: string | null;
  receivedAt?: number | null;
  createdAt: number;
}

interface Attachment {
  id: string;
  filename: string;
  contentType: string | null;
  sizeBytes: number | null;
  url: string;
  /**
   * `inline` means the attachment is part of the body — a logo in a signature, a
   * screenshot pasted into the message — referenced from the HTML by `contentId`.
   * Both are needed to resolve a `cid:` image, and inline parts are kept out of the
   * attachment strip so a signature logo does not look like a file to open.
   */
  disposition?: string;
  contentId?: string | null;
}

interface MessageDetail extends MessageSummary {
  /** Which mailbox it lives in — needed when a draft reopens in the composer. */
  mailboxId: string;
  bodyText: string;
  bodyHtml: string | null;
  ccAddresses: string | null;
  bccAddresses: string | null;
  rawKey: string | null;
  messageIdHeader?: string | null;
  attachments: Attachment[];
  delivery: {
    status: string; attempts: number; sentAt: number | null;
    errorCode: string | null; errorMessage: string | null;
  } | null;
}

const FOLDERS = [
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'sent', label: 'Sent', icon: Send },
  { id: 'drafts', label: 'Drafts', icon: FileEdit },
  { id: 'archive', label: 'Archive', icon: Archive },
  { id: 'spam', label: 'Spam', icon: ShieldAlert },
  { id: 'trash', label: 'Trash', icon: Trash2 },
] as const;

/** How often to look for new mail. Quiet enough not to matter, often enough to notice. */
const POLL_MS = 45_000;

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

function addressesOf(json: string | null): { email: string; name?: string }[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function when(ts: number | null | undefined): string {
  if (!ts) return '';
  const d = new Date(ts < 1e12 ? ts * 1000 : ts);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function size(bytes: number | null): string {
  if (!bytes) return '';
  return bytes < 1024 ? `${bytes} B`
    : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Quotes a message for a reply, the way every mail client does.
 *
 * Built client-side rather than on the server so the person can edit or delete it before
 * sending — a quote they cannot remove is worse than no quote.
 */
function quote(m: MessageDetail): string {
  const who = m.fromName ? `${m.fromName} <${m.fromAddress}>` : m.fromAddress;
  const stamp = new Date((m.receivedAt ?? m.createdAt) * (m.createdAt < 1e12 ? 1000 : 1)).toLocaleString();
  const body = m.bodyText.split('\n').map((l) => `> ${l}`).join('\n');
  return `\n\nOn ${stamp}, ${who} wrote:\n${body}\n`;
}

export default function MailboxTab({ scope, heading, description }: MailboxTabProps) {
  const [boxes, setBoxes] = useState<Mailbox[] | null>(null);
  const [activeBox, setActiveBox] = useState<string | null>(null);
  const [folder, setFolder] = useState<string>('inbox');
  const [messages, setMessages] = useState<MessageSummary[] | null>(null);
  const [open, setOpen] = useState<MessageDetail | null>(null);
  const [thread, setThread] = useState<MessageDetail[] | null>(null);
  const [composing, setComposing] = useState<ComposerSeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [term, setTerm] = useState('');
  const [results, setResults] = useState<MessageSummary[] | null>(null);
  /** The last message swiped to trash, offered back for a few seconds. */
  const [undo, setUndo] = useState<{ message: MessageSummary; at: number } | null>(null);

  /**
   * `scheduled` and `templates` sit in the folder rail but are not folders.
   *
   * A scheduled message lives in `sent` with a time on its delivery row — it IS sent as
   * far as the writer is concerned. Making it a folder would mean a message whose folder
   * disagreed with its delivery state, which is the class of thing that reads as a bug
   * later. Templates are not messages at all.
   */
  const [view, setView] = useState<'folder' | 'scheduled' | 'templates'>('folder');
  const [scheduled, setScheduled] = useState<ScheduledMessage[] | null>(null);

  /** Ids already announced, so a poll does not notify about the same mail twice. */
  const announced = useRef<Set<string>>(new Set());
  const [notifyOn, setNotifyOn] = useState(
    typeof Notification !== 'undefined' && Notification.permission === 'granted',
  );

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

  const loadMessages = useCallback(async (boxId: string, f: string, announce = false) => {
    try {
      const res = await fetch(`${API}/email/mailboxes/${boxId}/messages?folder=${f}`, { headers: authHeaders() });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load messages');
      const list: MessageSummary[] = json.data ?? [];

      /**
       * Notify only about mail that arrived while this tab was already open, and only
       * once per message. On the first load every message is new, which would mean a
       * wall of notifications for a full inbox — hence `announce` being false there.
       */
      if (announce && notifyOn && f === 'inbox') {
        const fresh = list.filter((m) => !m.isRead && m.direction === 'inbound' && !announced.current.has(m.id));
        for (const m of fresh.slice(0, 3)) {
          try {
            new Notification(m.fromName || m.fromAddress, {
              body: m.subject || '(no subject)',
              tag: m.id,
            });
          } catch { /* the browser may refuse; not worth surfacing */ }
        }
        if (fresh.length > 3) {
          try { new Notification(`${fresh.length} new messages`, { tag: 'bulk' }); } catch { /* ignore */ }
        }
      }
      for (const m of list) announced.current.add(m.id);

      setMessages(list);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
      setMessages((prev) => prev ?? []);
    }
  }, [notifyOn]);

  useEffect(() => {
    if (activeBox) loadMessages(activeBox, folder);
  }, [activeBox, folder, loadMessages]);

  /**
   * Live updates: a poll plus a refetch whenever the tab regains focus.
   *
   * Without this the list only changed when you switched folders, so new mail was
   * invisible until you happened to click something — which for a mail client is the
   * difference between a tool and an archive. Both triggers matter: the poll catches
   * mail while you are looking at it, the focus handler catches everything that arrived
   * while you were elsewhere, immediately rather than up to 45 seconds later.
   */
  useEffect(() => {
    if (!activeBox) return;
    const tick = () => {
      if (document.visibilityState === 'hidden') return;
      loadMessages(activeBox, folder, true);
    };
    const id = window.setInterval(tick, POLL_MS);
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', tick);
    };
  }, [activeBox, folder, loadMessages]);

  const loadScheduled = useCallback(async () => {
    try {
      const res = await fetch(`${API}/email/scheduled`, { headers: authHeaders() });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load scheduled messages');
      setScheduled(json.data ?? []);
    } catch (e) {
      setError(errorMessage(e));
      setScheduled([]);
    }
  }, []);

  async function cancelScheduled(id: string) {
    try {
      const res = await fetch(`${API}/email/scheduled/${id}/cancel`, {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: '{}',
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Could not cancel');
      await loadScheduled();
      // It went back to drafts rather than being marked cancelled, so that it can be
      // edited and rescheduled.
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function manualRefresh() {
    if (!activeBox) return;
    setRefreshing(true);
    await loadMessages(activeBox, folder, true);
    setRefreshing(false);
  }

  async function enableNotifications() {
    if (typeof Notification === 'undefined') return;
    // Asked on a click, never on load: a permission prompt nobody invited is refused,
    // and a refusal is permanent.
    const result = await Notification.requestPermission();
    setNotifyOn(result === 'granted');
  }

  async function openMessage(id: string) {
    try {
      const res = await fetch(`${API}/email/messages/${id}`, { headers: authHeaders() });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not open that message');
      const detail: MessageDetail = json.data;

      // A draft opens in the composer rather than the reader — it is unfinished writing,
      // not correspondence.
      if (detail.folder === 'drafts') {
        setComposing({
          draftId: detail.id,
          mailboxId: detail.mailboxId ?? activeBox ?? '',
          to: addressesOf(detail.toAddresses).map((a) => a.email).join(', '),
          cc: addressesOf(detail.ccAddresses).map((a) => a.email).join(', '),
          bcc: addressesOf(detail.bccAddresses).map((a) => a.email).join(', '),
          subject: detail.subject ?? '',
          text: detail.bodyText,
          // Reopens in the mode it was written in. Without this a formatted draft came
          // back as plain text and quietly lost its markup on the next save.
          ...(detail.bodyHtml ? { html: detail.bodyHtml } : {}),
          attachments: detail.attachments,
        });
        return;
      }

      setOpen(detail);
      setThread(null);
      if (!detail.isRead) {
        await patchMessage(id, { isRead: true }, false);
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function openThread(threadId: string) {
    try {
      const res = await fetch(`${API}/email/threads/${threadId}`, { headers: authHeaders() });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not open that conversation');
      setThread(json.data.messages ?? []);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  // The offer expires; a stale Undo pointing at a message you have since emptied from
  // trash would fail rather than help.
  useEffect(() => {
    if (!undo) return;
    const t = window.setTimeout(() => setUndo(null), 7000);
    return () => window.clearTimeout(t);
  }, [undo]);

  /**
   * Trash, with a way back.
   *
   * A swipe is easy to do by accident while scrolling a list one-handed, and the row
   * under your thumb might be the only copy of a client's reply. Trash is already a
   * recoverable folder, so this costs one piece of state and removes the only
   * irreversible-feeling gesture in the app.
   */
  function trashWithUndo(m: MessageSummary) {
    patchMessage(m.id, { folder: 'trash' });
    setUndo({ message: m, at: Date.now() });
  }

  async function patchMessage(id: string, patch: Record<string, unknown>, removeFromList = true) {
    try {
      const res = await fetch(`${API}/email/messages/${id}`, {
        method: 'PATCH',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Could not update that message');

      if (patch.folder && removeFromList) {
        setMessages((prev) => (prev ?? []).filter((m) => m.id !== id));
        setOpen(null);
        setThread(null);
      } else {
        setMessages((prev) => (prev ?? []).map((m) => (m.id === id ? { ...m, ...patch } : m)));
        setOpen((o) => (o && o.id === id ? { ...o, ...patch } : o));
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function runSearch() {
    if (term.trim().length < 2) { setResults(null); return; }
    try {
      const res = await fetch(`${API}/email/search?q=${encodeURIComponent(term.trim())}`, { headers: authHeaders() });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Search failed');
      setResults(json.data ?? []);
      setOpen(null);
      setThread(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  /** Reply, reply-all and forward all seed the same composer; only the prefill differs. */
  function startReply(m: MessageDetail, mode: 'reply' | 'replyAll' | 'forward') {
    const box = current;
    if (!box) return;
    const subject = m.subject ?? '';
    const prefixed = (p: string) => (subject.toLowerCase().startsWith(p.toLowerCase()) ? subject : `${p} ${subject}`);

    if (mode === 'forward') {
      setComposing({
        mailboxId: box.id, to: '', cc: '', bcc: '',
        subject: prefixed('Fwd:'),
        text: quote(m),
        attachments: [],
      });
      return;
    }

    const others = mode === 'replyAll'
      ? [...addressesOf(m.toAddresses), ...addressesOf(m.ccAddresses)]
        .map((a) => a.email)
        // Never write back to ourselves — a reply-all that includes the mailbox it is
        // sent from loops straight into the inbox it came from.
        .filter((e) => e.toLowerCase() !== box.address.toLowerCase())
      : [];

    setComposing({
      mailboxId: box.id,
      replyTo: m.id,
      to: m.fromAddress,
      cc: [...new Set(others)].join(', '),
      bcc: '',
      subject: prefixed('Re:'),
      text: quote(m),
      attachments: [],
    });
  }

  if (boxes === null) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-textSecondary" />
      </div>
    );
  }

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

  const list = results ?? messages;

  return (
    <div className="w-full">
      {(heading || description) && (
        <div className="mb-4">
          {heading && <h2 className="text-sm font-black uppercase tracking-widest text-textPrimary">{heading}</h2>}
          {description && <p className="mt-1 text-xs text-textSecondary">{description}</p>}
        </div>
      )}

      {boxes.length > 1 && (
        <div className="scroll-x no-scrollbar mb-3 flex gap-2">
          {boxes.map((b) => (
            <button
              key={b.id}
              onClick={() => { setActiveBox(b.id); setOpen(null); setThread(null); setResults(null); }}
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

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-border bg-surfaceAlt px-2.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-textSecondary" />
          <input
            value={term}
            onChange={(e) => { setTerm(e.target.value); if (e.target.value.trim().length < 2) setResults(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
            placeholder="Search mail…"
            className="min-w-0 flex-1 bg-transparent py-2 text-textPrimary outline-none placeholder:text-textSecondary/50"
          />
          {results !== null && (
            <button onClick={() => { setTerm(''); setResults(null); }} className="shrink-0 text-textSecondary">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          onClick={manualRefresh}
          title="Check for new mail"
          className="shrink-0 rounded-lg border border-border p-2 text-textSecondary transition-colors hover:bg-surfaceAlt"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
        {!notifyOn && typeof Notification !== 'undefined' && (
          <button
            onClick={enableNotifications}
            title="Be notified in this browser when mail arrives"
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-2 text-[11px] font-bold text-textSecondary transition-colors hover:bg-surfaceAlt"
          >
            <Bell className="h-3.5 w-3.5" /> Notify me
          </button>
        )}
      </div>

      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-col gap-3 md:flex-row">
        <div className="scroll-x no-scrollbar flex gap-1.5 md:w-40 md:shrink-0 md:flex-col">
          {current?.canSend && (
            <button
              onClick={() => setComposing({ mailboxId: current.id, to: '', cc: '', bcc: '', subject: '', text: '', attachments: [] })}
              className="mb-0 flex shrink-0 items-center gap-1.5 rounded-lg bg-module px-3 py-2 text-[11px] font-black uppercase tracking-wider text-onScrim transition-all active:scale-[0.97] md:mb-2 md:justify-center md:py-2.5"
            >
              <Plus className="h-3.5 w-3.5" /> Compose
            </button>
          )}
          {FOLDERS.map((f) => (
            <button
              key={f.id}
              onClick={() => { setView('folder'); setFolder(f.id); setOpen(null); setThread(null); setResults(null); }}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-bold transition-all md:w-full ${
                view === 'folder' && folder === f.id && results === null ? 'bg-module/10 text-module' : 'text-textSecondary hover:bg-surfaceAlt'
              }`}
            >
              <f.icon className="h-3.5 w-3.5" />
              {f.label}
            </button>
          ))}

          <button
            onClick={() => { setView('scheduled'); setOpen(null); setThread(null); setResults(null); loadScheduled(); }}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-bold transition-all md:w-full ${
              view === 'scheduled' ? 'bg-module/10 text-module' : 'text-textSecondary hover:bg-surfaceAlt'
            }`}
          >
            <Clock className="h-3.5 w-3.5" /> Scheduled
          </button>

          {scope.kind === 'app' && (
            <button
              onClick={() => { setView('templates'); setOpen(null); setThread(null); setResults(null); }}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-bold transition-all md:w-full ${
                view === 'templates' ? 'bg-module/10 text-module' : 'text-textSecondary hover:bg-surfaceAlt'
              }`}
            >
              <FileText className="h-3.5 w-3.5" /> Templates
            </button>
          )}

          {/* A plain link, not a fetch: the response is a streamed download, and letting
              the browser handle it means a large archive never passes through JS memory.
              The token rides in the query string because a download cannot carry a
              header — the same path /api/assets/download already uses. */}
          {activeBox && (
            <a
              href={`${API}/email/export?mailbox=${activeBox}&token=${encodeURIComponent(localStorage.getItem('ga_token') || '')}`}
              className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-bold text-textSecondary transition-all hover:bg-surfaceAlt md:w-full"
              title="Download everything in this mailbox as an mbox archive"
            >
              <Download className="h-3.5 w-3.5" /> Export
            </a>
          )}
        </div>

        <div className="min-w-0 flex-1">
          {view === 'templates' && scope.kind === 'app' ? (
            <TemplateEditor app={scope.app} />
          ) : view === 'scheduled' ? (
            <ScheduledList
              items={scheduled}
              onCancel={cancelScheduled}
              onRefresh={loadScheduled}
            />
          ) : thread ? (
            <ThreadView
              messages={thread}
              onBack={() => setThread(null)}
              onReply={(m, mode) => startReply(m, mode)}
              canSend={!!current?.canSend}
            />
          ) : open ? (
            <MessageView
              message={open}
              canSend={!!current?.canSend}
              onBack={() => setOpen(null)}
              onStar={() => patchMessage(open.id, { isStarred: !open.isStarred }, false)}
              onUnread={() => { patchMessage(open.id, { isRead: false }, false); setOpen(null); }}
              onMove={(f) => patchMessage(open.id, { folder: f })}
              onReply={(mode) => startReply(open, mode)}
              onOpenThread={() => open.threadId && openThread(open.threadId)}
            />
          ) : list === null ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-4 w-4 animate-spin text-textSecondary" />
            </div>
          ) : list.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface px-4 py-16 text-center">
              <p className="text-xs text-textSecondary">
                {results !== null ? `Nothing matching “${term}”.` : `Nothing in ${folder}.`}
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-surface">
              {results !== null && (
                <div className="border-b border-border bg-surfaceAlt px-3 py-2 text-[11px] text-textSecondary md:px-4">
                  {list.length} result{list.length === 1 ? '' : 's'} for “{term}”, newest first. Trash is excluded.
                </div>
              )}
              {list.map((m) => (
                <SwipeRow
                  key={m.id}
                  isRead={m.isRead}
                  onRead={() => patchMessage(m.id, { isRead: !m.isRead }, false)}
                  onTrash={() => trashWithUndo(m)}
                >
                <div
                  className={`flex items-start gap-2 border-b border-border px-3 py-3 transition-colors last:border-0 hover:bg-surfaceAlt md:px-4 ${
                    m.isRead ? '' : 'bg-module/[0.04]'
                  }`}
                >
                  {/* Starring from the list, which previously needed opening the message. */}
                  <button
                    onClick={() => patchMessage(m.id, { isStarred: !m.isStarred }, false)}
                    title={m.isStarred ? 'Unflag' : 'Flag'}
                    className="mt-0.5 shrink-0 p-0.5 text-textSecondary"
                  >
                    <Star className={`h-3.5 w-3.5 ${m.isStarred ? 'fill-warning text-warning' : ''}`} />
                  </button>
                  <button onClick={() => openMessage(m.id)} className="min-w-0 flex-1 text-left">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`truncate text-xs ${m.isRead ? 'text-textSecondary' : 'font-bold text-textPrimary'}`}>
                        {m.direction === 'outbound' ? `To: ${addressList(m.toAddresses)}` : (m.fromName || m.fromAddress)}
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
                  </button>
                </div>
                </SwipeRow>
              ))}
            </div>
          )}
        </div>
      </div>

      {undo && (
        <div
          className="fixed inset-x-3 bottom-3 z-40 flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-lg sm:left-auto sm:right-4 sm:w-80"
          style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <span className="min-w-0 flex-1 truncate text-[11px] text-textPrimary">
            Moved to trash — {undo.message.subject || '(no subject)'}
          </span>
          <button
            onClick={() => {
              patchMessage(undo.message.id, { folder: undo.message.folder }, false);
              setMessages((prev) => (prev ? [undo.message, ...prev.filter((m) => m.id !== undo.message.id)] : prev));
              setUndo(null);
            }}
            className="shrink-0 text-[11px] font-black uppercase tracking-wider text-module"
          >
            Undo
          </button>
        </div>
      )}

      {composing && boxes.length > 0 && (
        <Composer
          seed={composing}
          mailboxes={boxes.filter((b) => b.canSend && b.isActive)}
          onClose={() => setComposing(null)}
          onSent={(sentFrom) => {
            setComposing(null);
            setFolder('sent');
            setResults(null);
            setActiveBox(sentFrom);
            loadMessages(sentFrom, 'sent');
          }}
        />
      )}
    </div>
  );
}

// ── Reader ──────────────────────────────────────────────────────────────────

/**
 * Swipe a row on a touch screen: right toggles read, left moves to trash.
 *
 * Three things make this behave rather than fight the page:
 *
 * - **`touch-action: pan-y`** is what claims the horizontal axis for us and leaves
 *   the vertical one to the scroller. Without it the browser owns both and the row
 *   either never moves or the list stops scrolling — and `preventDefault` is not
 *   available to fix it, because React attaches touch listeners passively.
 * - **The axis is decided once per gesture**, on the first 10px, and never revisited.
 *   Deciding per move means a diagonal drag flickers between scrolling and swiping.
 * - **A pointer that is not coarse gets none of this.** On a desktop the same drag is
 *   a text selection, and stealing it to delete mail would be indefensible.
 */
function SwipeRow({
  children, onRead, onTrash, isRead,
}: {
  children: React.ReactNode;
  onRead: () => void;
  onTrash: () => void;
  isRead: boolean;
}) {
  const [dx, setDx] = useState(0);
  const [animating, setAnimating] = useState(false);
  const gesture = useRef<{ x: number; y: number; axis: 'x' | 'y' | null }>({ x: 0, y: 0, axis: null });

  /** How far the row must travel before letting go does anything. */
  const THRESHOLD = 72;
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

  if (!touch) return <>{children}</>;

  const end = () => {
    const { axis } = gesture.current;
    const travelled = dx;
    gesture.current = { x: 0, y: 0, axis: null };
    if (axis !== 'x') { setDx(0); return; }

    setAnimating(true);
    setDx(0);
    window.setTimeout(() => setAnimating(false), 180);

    if (travelled >= THRESHOLD) onRead();
    else if (travelled <= -THRESHOLD) onTrash();
  };

  const armed = Math.abs(dx) >= THRESHOLD;

  return (
    <div className="relative overflow-hidden">
      {/* The action under the row, revealed by the drag. Which side shows is the
          sign of the travel, so the reader sees what letting go will do. */}
      <div
        className={`absolute inset-0 flex items-center px-4 ${
          dx > 0 ? 'justify-start bg-module/15' : 'justify-end bg-danger/15'
        } ${dx === 0 ? 'opacity-0' : 'opacity-100'}`}
      >
        <span className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider ${
          dx > 0 ? 'text-module' : 'text-danger'
        } ${armed ? '' : 'opacity-50'}`}
        >
          {dx > 0
            ? <><MailOpen className="h-3.5 w-3.5" />{isRead ? 'Unread' : 'Read'}</>
            : <><Trash2 className="h-3.5 w-3.5" />Trash</>}
        </span>
      </div>

      <div
        style={{
          transform: `translateX(${dx}px)`,
          transition: animating ? 'transform 0.18s ease-out' : 'none',
          touchAction: 'pan-y',
        }}
        className="relative bg-surface"
        onTouchStart={(e) => {
          const t = e.touches[0];
          gesture.current = { x: t.clientX, y: t.clientY, axis: null };
        }}
        onTouchMove={(e) => {
          const t = e.touches[0];
          const g = gesture.current;
          const ddx = t.clientX - g.x;
          const ddy = t.clientY - g.y;
          if (g.axis === null) {
            if (Math.abs(ddx) > 10 && Math.abs(ddx) > Math.abs(ddy)) g.axis = 'x';
            else if (Math.abs(ddy) > 10) g.axis = 'y';
            else return;
          }
          if (g.axis !== 'x') return;
          // Resists past the threshold rather than stopping dead, so the gesture
          // still feels attached to the finger once it has done its job.
          const over = Math.max(0, Math.abs(ddx) - THRESHOLD);
          const eased = Math.sign(ddx) * (Math.min(Math.abs(ddx), THRESHOLD) + over * 0.3);
          setDx(eased);
        }}
        onTouchEnd={end}
        onTouchCancel={end}
      >
        {children}
      </div>
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

function Attachments({ items }: { items: Attachment[] }) {
  // An inline part with a Content-ID is rendered inside the message body, so listing
  // it here as well presents a signature logo as a file worth opening.
  const shown = items.filter((a) => !(a.disposition === 'inline' && a.contentId));
  if (shown.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 border-t border-border px-3 py-3 md:px-4">
      {shown.map((a) => (
        <a
          key={a.id}
          href={a.url}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-surfaceAlt px-2.5 py-1.5 text-[11px] text-textPrimary transition-colors hover:border-module/40"
        >
          <Paperclip className="h-3 w-3 text-textSecondary" />
          {a.filename}
          {a.sizeBytes ? <span className="text-textSecondary">{size(a.sizeBytes)}</span> : null}
        </a>
      ))}
    </div>
  );
}

/**
 * Plain text is the default view, and formatting is one tap away.
 *
 * That ordering is deliberate rather than conservative-by-habit. The words are what
 * you came for and they render instantly; the sandboxed frame is built only when you
 * ask for it, so the riskiest machinery in the app is exercised per message on
 * purpose instead of automatically on every open. It also means a malformed or
 * hostile HTML part can never stop you reading what somebody said.
 */
function Body({ message }: { message: MessageDetail }) {
  const [formatted, setFormatted] = useState(false);
  const hasHtml = !!message.bodyHtml?.trim();

  return (
    <>
      {hasHtml && (
        <div className="flex flex-wrap items-center gap-2 px-3 pt-3 md:px-4">
          <button
            onClick={() => setFormatted((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-textSecondary transition-colors hover:bg-surfaceAlt"
          >
            {formatted ? <FileText className="h-3.5 w-3.5" /> : <Type className="h-3.5 w-3.5" />}
            {formatted ? 'Plain text' : 'Show formatted'}
          </button>
          {message.direction === 'inbound' && message.rawKey && (
            <a
              href={`${API}/assets/download/${encodeURIComponent(message.rawKey)}`}
              className="text-[11px] text-textSecondary underline"
            >
              Download original
            </a>
          )}
        </div>
      )}

      {formatted && hasHtml ? (
        <div className="px-3 py-3 md:px-4">
          <MailHtml html={message.bodyHtml!} attachments={inlineParts(message.attachments)} />
        </div>
      ) : (
        <pre className="whitespace-pre-wrap break-words px-3 py-4 text-xs leading-relaxed text-textPrimary md:px-4">
          {message.bodyText}
        </pre>
      )}
    </>
  );
}

/** Shapes the message's attachments for the renderer's `cid:` lookup. */
function inlineParts(items: Attachment[] | undefined): InlineAttachment[] {
  return (items ?? []).map((a) => ({
    id: a.id,
    contentId: a.contentId ?? null,
    disposition: a.disposition ?? 'attachment',
    url: a.url,
    contentType: a.contentType,
  }));
}

function ReplyBar({
  canSend, onReply, compact,
}: {
  canSend: boolean;
  onReply: (mode: 'reply' | 'replyAll' | 'forward') => void;
  compact?: boolean;
}) {
  if (!canSend) return null;
  const cls = 'flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-textSecondary transition-colors hover:bg-surfaceAlt';
  return (
    <div className={`flex flex-wrap gap-2 ${compact ? '' : 'border-t border-border px-3 py-3 md:px-4'}`}>
      <button onClick={() => onReply('reply')} className={cls}><Reply className="h-3.5 w-3.5" /> Reply</button>
      <button onClick={() => onReply('replyAll')} className={cls}><ReplyAll className="h-3.5 w-3.5" /> Reply all</button>
      <button onClick={() => onReply('forward')} className={cls}><Forward className="h-3.5 w-3.5" /> Forward</button>
    </div>
  );
}

function MessageView({
  message, canSend, onBack, onStar, onUnread, onMove, onReply, onOpenThread,
}: {
  message: MessageDetail;
  canSend: boolean;
  onBack: () => void;
  onStar: () => void;
  onUnread: () => void;
  onMove: (folder: string) => void;
  onReply: (mode: 'reply' | 'replyAll' | 'forward') => void;
  onOpenThread: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex items-center gap-1 border-b border-border px-2 py-2.5 md:px-3">
        <button onClick={onBack} className="rounded-lg p-1.5 text-textSecondary transition-colors hover:bg-surfaceAlt">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-0 flex-1 truncate text-xs font-bold text-textPrimary">
          {message.subject || '(no subject)'}
        </span>
        <button onClick={onStar} title="Flag" className="rounded-lg p-1.5 text-textSecondary transition-colors hover:bg-surfaceAlt">
          <Star className={`h-4 w-4 ${message.isStarred ? 'fill-warning text-warning' : ''}`} />
        </button>
        <button onClick={onUnread} title="Mark unread" className="rounded-lg p-1.5 text-textSecondary transition-colors hover:bg-surfaceAlt">
          <MailOpen className="h-4 w-4" />
        </button>
        {message.folder === 'spam' ? (
          <button onClick={() => onMove('inbox')} title="Not spam — move to inbox" className="rounded-lg p-1.5 text-textSecondary transition-colors hover:bg-surfaceAlt">
            <Inbox className="h-4 w-4" />
          </button>
        ) : (
          <button onClick={() => onMove('spam')} title="Mark as spam" className="rounded-lg p-1.5 text-textSecondary transition-colors hover:bg-surfaceAlt">
            <ShieldAlert className="h-4 w-4" />
          </button>
        )}
        <button onClick={() => onMove('archive')} title="Archive" className="rounded-lg p-1.5 text-textSecondary transition-colors hover:bg-surfaceAlt">
          <Archive className="h-4 w-4" />
        </button>
        <button onClick={() => onMove('trash')} title="Move to trash" className="rounded-lg p-1.5 text-textSecondary transition-colors hover:bg-surfaceAlt">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-1 border-b border-border px-3 py-3 text-[11px] md:px-4">
        <Row label="From" value={message.fromName ? `${message.fromName} <${message.fromAddress}>` : message.fromAddress} />
        <Row label="To" value={addressList(message.toAddresses)} />
        {message.ccAddresses && <Row label="Cc" value={addressList(message.ccAddresses)} />}
        {/* Bcc shows only on mail we sent. It is stored so the sent log can answer "who
            did this go to", and is never part of a received message's headers. */}
        {message.direction === 'outbound' && message.bccAddresses && addressList(message.bccAddresses) && (
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
        {message.threadId && (
          <button onClick={onOpenThread} className="flex items-center gap-1 pt-0.5 text-[11px] font-bold text-module">
            <CornerUpLeft className="h-3 w-3" /> View whole conversation
          </button>
        )}
      </div>

      <Body message={message} />
      <Attachments items={message.attachments} />
      <ReplyBar canSend={canSend} onReply={onReply} />
    </div>
  );
}

function ThreadView({
  messages, onBack, onReply, canSend,
}: {
  messages: MessageDetail[];
  onBack: () => void;
  onReply: (m: MessageDetail, mode: 'reply' | 'replyAll' | 'forward') => void;
  canSend: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(messages[messages.length - 1]?.id ?? null);
  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-2 py-2.5 md:px-3">
        <button onClick={onBack} className="rounded-lg p-1.5 text-textSecondary transition-colors hover:bg-surfaceAlt">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-0 flex-1 truncate text-xs font-bold text-textPrimary">
          {messages[0]?.subject || '(no subject)'}
        </span>
        <span className="shrink-0 text-[10px] text-textSecondary">{messages.length} messages</span>
      </div>

      {messages.map((m) => {
        const isOpen = expanded === m.id;
        return (
          <div key={m.id} className="border-b border-border last:border-0">
            <button
              onClick={() => setExpanded(isOpen ? null : m.id)}
              className="flex w-full items-baseline gap-2 px-3 py-2.5 text-left transition-colors hover:bg-surfaceAlt md:px-4"
            >
              <span className={`min-w-0 flex-1 truncate text-xs ${m.direction === 'outbound' ? 'text-textSecondary' : 'font-bold text-textPrimary'}`}>
                {m.direction === 'outbound' ? `You → ${addressList(m.toAddresses)}` : (m.fromName || m.fromAddress)}
              </span>
              <span className="shrink-0 text-[10px] text-textSecondary">{when(m.receivedAt ?? m.createdAt)}</span>
            </button>
            {isOpen && (
              <>
                <Body message={m} />
                <Attachments items={m.attachments ?? []} />
                {m.direction === 'inbound' && (
                  <div className="px-3 pb-3 md:px-4">
                    <ReplyBar canSend={canSend} onReply={(mode) => onReply(m, mode)} compact />
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Composer ────────────────────────────────────────────────────────────────

interface ComposerSeed {
  draftId?: string;
  mailboxId: string;
  replyTo?: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  text: string;
  /** Set when reopening a draft that was written with formatting. */
  html?: string;
  attachments: Attachment[];
}

function Composer({
  seed, mailboxes, onClose, onSent,
}: {
  seed: ComposerSeed;
  mailboxes: Mailbox[];
  onClose: () => void;
  onSent: (sentFrom: string) => void;
}) {
  const [fromId, setFromId] = useState(seed.mailboxId || mailboxes[0]?.id || '');
  const mailbox = mailboxes.find((b) => b.id === fromId) ?? mailboxes[0];

  const [draftId, setDraftId] = useState<string | undefined>(seed.draftId);
  const [to, setTo] = useState(seed.to);
  const [cc, setCc] = useState(seed.cc);
  const [bcc, setBcc] = useState(seed.bcc);
  const [showCc, setShowCc] = useState(!!(seed.cc || seed.bcc));
  const [subject, setSubject] = useState(seed.subject);
  const [text, setText] = useState(seed.text);
  /**
   * The HTML part, empty in plain mode.
   *
   * `text` is maintained in both modes rather than derived at send time, because
   * `body_text` is NOT NULL in the DDL and is what a client with images off — or a
   * screen reader — actually reads. A rich message is therefore always sent as both
   * parts, never as HTML alone.
   */
  const [html, setHtml] = useState(seed.html ?? '');
  const [rich, setRich] = useState(!!seed.html);
  const [attachments, setAttachments] = useState<Attachment[]>(seed.attachments);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  /** Empty means send now. A `datetime-local` value, i.e. the writer's own clock. */
  const [sendAt, setSendAt] = useState('');
  /**
   * The schedule row is hidden until asked for. A `datetime-local` is the widest
   * control in the footer by a distance, and leaving it there made the footer wrap
   * to three rows on a 390px screen — which on a full-height composer is height
   * taken directly out of the message body.
   */
  const [showSchedule, setShowSchedule] = useState(false);

  const split = (v: string) => v.split(/[,;\s]+/).map((s) => s.trim()).filter((s) => s.includes('@'));
  const recipientCount = split(to).length + split(cc).length + split(bcc).length;
  const overBulk = recipientCount > 10 && !mailbox?.canBulk;

  /** Saves and returns the draft id, creating one if this is the first save. */
  const saveDraft = useCallback(async (): Promise<string | null> => {
    if (!mailbox) return null;
    const res = await fetch(`${API}/email/drafts${draftId ? `/${draftId}` : ''}`, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mailboxId: mailbox.id,
        to: split(to), cc: split(cc), bcc: split(bcc),
        subject, text,
        ...(rich && html.trim() ? { html } : {}),
        ...(seed.replyTo ? { replyTo: seed.replyTo } : {}),
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Could not save the draft');
    const id = json.data.id as string;
    setDraftId(id);
    return id;
  }, [mailbox, draftId, to, cc, bcc, subject, text, rich, html, seed.replyTo]);

  async function attach(file: File) {
    setBusy('attach');
    setError(null);
    try {
      /**
       * An attachment needs a message id, so the draft is saved first. That is the whole
       * reason attachments live on drafts rather than on an in-flight compose: it keeps
       * the upload route off /api/assets/upload, whose prefix allowlist must never
       * include the one holding received mail.
       */
      const id = draftId ?? (await saveDraft());
      if (!id) return;

      const form = new FormData();
      form.set('file', file);
      const res = await fetch(`${API}/email/drafts/${id}/attachments`, {
        method: 'POST', headers: authHeaders(), body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not attach that file');
      setAttachments((prev) => [...prev, json.data]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function removeAttachment(id: string) {
    if (!draftId) return;
    try {
      await fetch(`${API}/email/drafts/${draftId}/attachments/${id}`, { method: 'DELETE', headers: authHeaders() });
      setAttachments((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function saveAndClose() {
    setBusy('save');
    try {
      await saveDraft();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  }

  async function submit() {
    if (!mailbox) return;
    setBusy('send');
    setError(null);
    try {
      /**
       * Everything sends through the draft path, attachments or not. One route means one
       * place the caps, the bulk threshold and the authorisation are checked — and the
       * draft id is the idempotency key, so a double-clicked Send cannot send twice.
       */
      const id = draftId ?? (await saveDraft());
      if (!id) return;
      const res = await fetch(`${API}/email/drafts/${id}/send`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        /**
         * `datetime-local` has no timezone, so it is read in the writer's own zone —
         * which is what they meant — and sent as an absolute instant. Passing the bare
         * string would have the server read it as UTC and send at the wrong hour.
         */
        body: JSON.stringify(sendAt ? { scheduledFor: new Date(sendAt).toISOString() } : {}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not send');
      onSent(mailbox.id);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  }

  if (!mailbox) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4">
      {/**
        * Full screen on a phone, a centred card from `sm` up.
        *
        * Deliberately NOT `.sheet`: that class caps a dialog at 92dvh and docks it to
        * the bottom edge, which is right for a form and wrong for a composer. Writing
        * is the whole task here, so the composer takes the screen the way a mail app
        * does — and because `.sheet` is unlayered CSS, a Tailwind height utility would
        * lose to it. The body below is the only element that grows, so every pixel not
        * spent on a header or a footer goes to the message.
        */}
      <div className="composer-panel flex h-full w-full flex-col overflow-hidden bg-surface sm:h-auto sm:max-h-[90dvh] sm:max-w-2xl sm:rounded-2xl sm:border sm:border-border">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-3">
          <div className="min-w-0">
            <h3 className="text-xs font-black uppercase tracking-widest text-textPrimary">
              {seed.replyTo ? 'Reply' : draftId ? 'Draft' : 'New message'}
            </h3>
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

        {/* The addressing block never scrolls away — you can always see who this is to. */}
        <div className="shrink-0 px-4 pt-2">
          <Field label="To" value={to} onChange={setTo} placeholder="someone@example.com" />
          {showCc ? (
            <>
              <Field label="Cc" value={cc} onChange={setCc} placeholder="" />
              <Field label="Bcc" value={bcc} onChange={setBcc} placeholder="" />
            </>
          ) : (
            <div className="flex justify-end pt-1">
              <button onClick={() => setShowCc(true)} className="text-[11px] font-bold text-module">Add Cc / Bcc</button>
            </div>
          )}
          <Field label="Subject" value={subject} onChange={setSubject} placeholder="" />
        </div>

        {/**
          * The body is the one element that grows. `min-h-0` is what lets a flex child
          * shrink under its own content; `resize-none` because a manual resize handle is
          * meaningless when the box is already exactly the free space.
          *
          * The editor is mounted with a `key` so switching modes remounts it rather than
          * reusing a `contentEditable` whose DOM is its own state — see RichText.
          */}
        {rich ? (
          <RichText
            key={`rich-${draftId ?? 'new'}`}
            initialHtml={html}
            onChange={(v) => { setHtml(v.html); setText(v.text); }}
          />
        ) : (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write your message…"
            className="min-h-0 w-full flex-1 resize-none bg-transparent px-4 py-3 leading-relaxed text-textPrimary outline-none placeholder:text-textSecondary/50 sm:min-h-[12rem]"
          />
        )}

        <div className="shrink-0 space-y-2 px-4 pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) attach(f); }}
              className="hidden"
            />
            <button
              onClick={() => fileInput.current?.click()}
              disabled={busy === 'attach'}
              className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-textSecondary transition-colors hover:bg-surfaceAlt disabled:opacity-40"
            >
              {busy === 'attach' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
              Attach
            </button>
            {attachments.map((a) => (
              <span key={a.id} className="flex items-center gap-1.5 rounded-lg border border-border bg-surfaceAlt px-2.5 py-1.5 text-[11px] text-textPrimary">
                {a.filename}
                <span className="text-textSecondary">{size(a.sizeBytes)}</span>
                <button onClick={() => removeAttachment(a.id)} className="text-textSecondary"><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>

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

        {/* Revealed by the clock button, so the footer stays one row at 390px. */}
        {showSchedule && (
          <div className="flex shrink-0 items-center gap-2 border-t border-border px-4 py-2">
            <Clock className="h-3.5 w-3.5 shrink-0 text-textSecondary" />
            <input
              type="datetime-local"
              value={sendAt}
              onChange={(e) => setSendAt(e.target.value)}
              min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
              className="min-w-0 flex-1 rounded border border-border bg-surfaceAlt px-2 py-1.5 text-textPrimary outline-none"
            />
            <button
              onClick={() => { setSendAt(''); setShowSchedule(false); }}
              title="Send now instead"
              className="shrink-0 rounded-lg p-1.5 text-textSecondary transition-colors hover:bg-surfaceAlt"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div
          className="flex shrink-0 items-center gap-2 border-t border-border px-4 py-3"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={() => {
              /**
               * Leaving rich mode keeps the text and drops the markup, which is the
               * honest direction to lose information in: the words survive and the
               * formatting does not, rather than the reverse.
               */
              if (rich) setHtml('');
              setRich((v) => !v);
            }}
            title={rich ? 'Switch to plain text' : 'Switch to formatted text'}
            className={`shrink-0 rounded-lg border p-2 transition-colors ${
              rich ? 'border-module/40 bg-module/10 text-module' : 'border-border text-textSecondary hover:bg-surfaceAlt'
            }`}
          >
            <Type className="h-3.5 w-3.5" />
          </button>
          {!showSchedule && (
            <button
              onClick={() => setShowSchedule(true)}
              title="Send later"
              className="shrink-0 rounded-lg border border-border p-2 text-textSecondary transition-colors hover:bg-surfaceAlt"
            >
              <Clock className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={saveAndClose}
            disabled={!!busy}
            className="shrink-0 rounded-lg border border-border px-3 py-2 text-[11px] font-bold text-textSecondary transition-colors hover:bg-surfaceAlt disabled:opacity-40"
          >
            {busy === 'save' ? 'Saving…' : 'Draft'}
          </button>
          {/* Takes the slack, so Send stays hard against the right edge at every width. */}
          <span className="min-w-0 flex-1 truncate text-right text-[10px] text-textSecondary">
            {recipientCount > 0 && `${recipientCount} recipient${recipientCount === 1 ? '' : 's'}`}
          </span>
          <button
            onClick={submit}
            disabled={!!busy || recipientCount === 0 || !subject.trim() || !text.trim() || overBulk}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-module px-4 py-2 text-[11px] font-black uppercase tracking-wider text-onScrim transition-all active:scale-[0.97] disabled:opacity-40"
          >
            {busy === 'send' ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : sendAt ? <Clock className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
            {sendAt ? 'Schedule' : 'Send'}
          </button>
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

// ── Scheduled ───────────────────────────────────────────────────────────────

interface ScheduledMessage {
  id: string;
  mailboxId: string;
  subject: string | null;
  toAddresses: string;
  preview: string;
  scheduledFor: number;
  status: string;
}

function ScheduledList({
  items, onCancel, onRefresh,
}: {
  items: ScheduledMessage[] | null;
  onCancel: (id: string) => void;
  onRefresh: () => void;
}) {
  if (items === null) {
    return (
      <div className="flex items-center gap-2 py-12 text-xs text-textSecondary">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-start justify-between gap-3">
        <p className="text-[11px] leading-relaxed text-textSecondary">
          Waiting to go out. The five-minute sweep sends each one once its time arrives, so a message may
          leave up to five minutes late — never early. Cancelling returns it to Drafts so you can change
          it and schedule again.
        </p>
        <button onClick={onRefresh} className="shrink-0 rounded-lg border border-border p-1.5 text-textSecondary hover:bg-surfaceAlt">
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-4 py-12 text-center">
          <Clock className="mx-auto mb-3 h-8 w-8 text-textSecondary opacity-40" />
          <p className="text-xs text-textSecondary">Nothing scheduled.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          {items.map((m) => (
            <div key={m.id} className="flex items-start gap-3 border-b border-border p-3 last:border-0 md:p-4">
              <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-module" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-textPrimary">
                  {new Date((m.scheduledFor < 1e12 ? m.scheduledFor * 1000 : m.scheduledFor)).toLocaleString()}
                </div>
                <div className="mt-0.5 truncate text-[11px] text-textSecondary">
                  To: {addressList(m.toAddresses)}
                </div>
                <div className="mt-0.5 truncate text-xs text-textPrimary">{m.subject || '(no subject)'}</div>
                <div className="mt-0.5 truncate text-[11px] text-textSecondary">{m.preview}</div>
              </div>
              <button
                onClick={() => onCancel(m.id)}
                className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-textSecondary hover:bg-surfaceAlt"
              >
                Cancel
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
