import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, ImageOff } from 'lucide-react';
import { API, authHeaders } from '../lib/auth';
import {
  MAIL_SANDBOX, bareCid, mailCsp, sanitiseMail, type InlineAttachment,
} from '../lib/mail-safety';

export type { InlineAttachment };

/**
 * Rendering a stranger's HTML.
 *
 * This is the most dangerous single operation in Pleiades, and it is worth being
 * explicit about why. The catch-all accepts mail to any address at the domain, so
 * **anybody on the internet can put content into this component** — no account, no
 * grant, no phishing step. And `ga_token` lives in localStorage: a script that runs
 * in our origin reads it and is that user, across every mailbox and module they can
 * reach. One email would be full account takeover.
 *
 * So the primary control is NOT this file's sanitiser. Sanitisers lose — mutation
 * XSS, namespace confusion in `<svg>`/`<math>`, a parser differential between the
 * one here and the one in the browser. The control is the **iframe sandbox with no
 * `allow-scripts`**, which disables scripting for that browsing context entirely:
 * inline handlers, `javascript:` URLs, `<script>`, all inert, enforced by the
 * browser rather than by a regex. The sanitiser below is defence in depth.
 *
 * ## Two rules that must not be relaxed
 *
 * 1. **Never add `allow-scripts`.** It is the whole protection.
 * 2. **Never add `allow-same-origin`.** Alone it is harmless — there is no script to
 *    abuse it — but together with `allow-scripts` the sandbox is worth nothing, and
 *    the two arriving in separate commits months apart is exactly how that happens.
 *
 * Rule 2 has a cost, paid deliberately: an opaque-origin iframe cannot be measured
 * from the parent, so this component cannot auto-size to its content and instead
 * estimates a height and offers an expand control. A shorter box is a better trade
 * than a sandbox one edit away from being useless. `test/mail-html.test.ts` pins
 * both rules.
 *
 * ## Why inline images are data: URIs
 *
 * The same missing `allow-same-origin` means the iframe cannot authenticate to
 * `/api/assets/download` — it has no cookies and no way to send a header. So a
 * `cid:` reference is resolved by the **parent**, which is authenticated, fetching
 * the attachment and inlining it. That falls out well: the default CSP is
 * `img-src data:`, which renders the message's own images and blocks every remote
 * one with the same rule.
 *
 * ## Why remote images are blocked
 *
 * A remote image in email is usually a beacon. Loading it confirms the address is
 * live, says when it was read and from which IP, and — when the URL is unique per
 * recipient — identifies who read it even from a shared mailbox. Blocked by default,
 * loaded per message on request, and the choice is deliberately not remembered.
 */

const FRAME_CSS = `
  html, body { margin: 0; padding: 0; }
  body {
    font: 15px/1.6 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #111; background: #fff;
    padding: 12px;
    /* Mail is full of fixed-width tables built for a desktop. Without these a
       390px screen scrolls sideways under the reader's thumb. */
    overflow-wrap: break-word;
    word-break: break-word;
  }
  img { max-width: 100% !important; height: auto !important; }
  table { max-width: 100% !important; }
  /* A held-back image still occupies its box, with a hint of why. */
  img[data-blocked], img[data-missing] {
    min-width: 28px; min-height: 28px;
    background: repeating-linear-gradient(45deg, #f3f4f6, #f3f4f6 6px, #e5e7eb 6px, #e5e7eb 12px);
    border: 1px dashed #cbd5e1; border-radius: 4px;
  }
  a { color: #1d4ed8; }
  blockquote {
    margin: 0 0 0 8px; padding-left: 10px;
    border-left: 2px solid #d1d5db; color: #4b5563;
  }
  pre { white-space: pre-wrap; }
`;

/** Above this, the frame is capped and an expand control appears. */
const COLLAPSED_MAX = 520;

export function MailHtml({ html, attachments }: { html: string; attachments: InlineAttachment[] }) {
  const [allowRemote, setAllowRemote] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [cids, setCids] = useState<Map<string, string>>(new Map());

  /**
   * Resolve `cid:` images to data URIs, in the parent, because the frame cannot
   * authenticate. Only attachments actually referenced by the body are fetched, and
   * only up to a budget — a message with forty inline photographs should not pull
   * forty megabytes into a string on a phone.
   */
  useEffect(() => {
    const lower = html.toLowerCase();
    const referenced = attachments.filter(
      (a) => a.contentId && lower.includes(`cid:${bareCid(a.contentId)}`),
    );
    if (!referenced.length) return;

    let cancelled = false;
    const BUDGET = 4 * 1024 * 1024;

    (async () => {
      const out = new Map<string, string>();
      let spent = 0;
      for (const a of referenced) {
        if (cancelled || spent > BUDGET) break;
        try {
          const res = await fetch(`${API}${a.url.replace(/^\/api/, '')}`, { headers: authHeaders() });
          if (!res.ok) continue;
          const blob = await res.blob();
          if (blob.size + spent > BUDGET) continue;
          spent += blob.size;
          const data = await new Promise<string>((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(String(fr.result));
            fr.onerror = () => reject(fr.error);
            fr.readAsDataURL(blob);
          });
          out.set(bareCid(a.contentId!), data);
        } catch { /* a missing inline image is not worth failing the message over */ }
      }
      if (!cancelled && out.size) setCids(out);
    })();

    return () => { cancelled = true; };
  }, [attachments, html]);

  const { html: clean, blockedRemote } = useMemo(
    () => sanitiseMail(html, { allowRemote, cids }),
    [html, allowRemote, cids],
  );

  const srcDoc = useMemo(() => (
    '<!doctype html><html><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + `<meta http-equiv="Content-Security-Policy" content="${mailCsp(allowRemote)}">`
    + `<style>${FRAME_CSS}</style></head><body>${clean}</body></html>`
  ), [clean, allowRemote]);

  /**
   * An estimate, because an opaque-origin frame cannot be measured — see the header.
   * Generous enough that most mail needs no interaction, capped so a newsletter does
   * not push the reply button off the bottom of a phone.
   */
  const estimate = useMemo(() => {
    const text = clean.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const images = (clean.match(/<img/gi) ?? []).length;
    return Math.min(1400, Math.max(180, Math.ceil(text.length / 1.6) + images * 140));
  }, [clean]);

  return (
    <div className="space-y-2">
      {blockedRemote > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-[11px] text-warning">
          <ImageOff className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1">
            {blockedRemote} remote image{blockedRemote === 1 ? '' : 's'} blocked. Loading them tells
            the sender this address is live and that you read this.
          </span>
          <button
            onClick={() => setAllowRemote(true)}
            className="shrink-0 rounded border border-warning/40 px-2 py-1 font-bold uppercase tracking-wider"
          >
            Load images
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="flex items-center gap-1.5 border-b border-border bg-surfaceAlt px-3 py-1.5">
          <AlertTriangle className="h-3 w-3 shrink-0 text-textSecondary" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-textSecondary">
            External content — written by the sender
          </span>
        </div>
        <iframe
          title="Message content"
          sandbox={MAIL_SANDBOX}
          srcDoc={srcDoc}
          referrerPolicy="no-referrer"
          className="block w-full bg-white"
          style={{ height: `${expanded ? estimate : Math.min(estimate, COLLAPSED_MAX)}px` }}
        />
        {estimate > COLLAPSED_MAX && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center justify-center gap-1.5 border-t border-border bg-surfaceAlt py-2 text-[11px] font-bold text-textSecondary transition-colors hover:bg-surface"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        )}
      </div>
    </div>
  );
}
