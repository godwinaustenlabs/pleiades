import React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Download, FileText } from 'lucide-react';
import { token } from '../lib/auth';

/**
 * Renders markdown for the asset previewer and the accountant chat.
 *
 * Styling is done with explicit element overrides rather than Tailwind's
 * `prose` classes: @tailwindcss/typography is not installed in this project, so
 * `prose` is inert and silently does nothing (see the note reader in
 * UserDashboard, which reads as unstyled for exactly that reason).
 *
 * Raw HTML in the source is deliberately NOT rendered. react-markdown ignores
 * it unless rehype-raw is added, and these documents are uploaded by users —
 * enabling it would turn any uploaded .md into stored XSS on this origin, which
 * is the same hole the Content-Type hardening closed for downloads.
 */

const ASSET_PREFIX = '/api/assets/download/';

/** Last path segment, tolerating the %2F-encoded keys the agent emits. */
function fileNameOf(path: string): string {
  const clean = path.split('?')[0];
  let decoded = clean;
  try {
    decoded = decodeURIComponent(clean);
  } catch {
    /* a stray % is not worth failing the render over */
  }
  return decoded.split('/').filter(Boolean).pop() || 'file';
}

/**
 * Turns a bare asset path into a real download control.
 *
 * The token has to ride in the query string: the JWT lives in localStorage and
 * nothing sets the `auth_token` cookie that `middleware/auth.ts` also accepts,
 * so a plain <a href> to this endpoint answers 401. `?token=` is the documented
 * path for exactly this case and is what TaskBoard already does for its
 * attachments.
 */
function AssetDownload({ href }: { href: string }) {
  const name = fileNameOf(href.slice(ASSET_PREFIX.length));
  const ext = (name.includes('.') ? name.split('.').pop() : '')?.toUpperCase();
  const sep = href.includes('?') ? '&' : '?';

  return (
    <a
      href={`${href}${sep}token=${encodeURIComponent(token() || '')}`}
      target="_blank"
      rel="noopener noreferrer"
      download={name}
      className="not-prose my-3 no-underline inline-flex items-center gap-3 max-w-full rounded-xl border border-border bg-surfaceAlt hover:bg-surface hover:border-primary/40 px-4 py-3 transition-all duration-300 group"
    >
      <span className="w-9 h-9 shrink-0 rounded-lg bg-primary/10 border border-primary/20 text-primary flex items-center justify-center">
        <FileText className="w-4 h-4" />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block text-[13px] font-semibold text-textPrimary truncate">{name}</span>
        <span className="block text-[11px] text-textTertiary">{ext ? `${ext} · ` : ''}Click to download</span>
      </span>
      <Download className="w-4 h-4 ml-1 shrink-0 text-textTertiary group-hover:text-primary transition-colors" />
    </a>
  );
}

/**
 * Promotes bare asset paths to markdown links so the `a` override can render
 * them as buttons. The model tends to emit the path as plain or bolded text
 * rather than a link, so relying on it to produce link syntax is not enough.
 *
 * The alternation matches an existing markdown link first and returns it
 * untouched, which is what keeps already-linked paths from being rewritten.
 */
function linkifyAssets(src: string): string {
  return src.replace(
    /\[[^\]]*\]\([^)]*\)|\*{0,2}(\/api\/assets\/download\/[^\s*)\]]+)\*{0,2}/g,
    (match, path?: string) => (path ? `[${fileNameOf(path)}](${path})` : match),
  );
}

/** Uploaded documents can link anywhere, so treat every link as untrusted. */
function PlainLink({ href, children }: { href?: string; children?: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="text-infoHover underline underline-offset-2 hover:text-infoHover break-words"
    >
      {children}
    </a>
  );
}

const components: Components = {
  h1: ({ children }) => (
    <h1 className="text-2xl font-black tracking-tight mt-8 mb-3 pb-2 border-b border-current/10 first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-xl font-black tracking-tight mt-7 mb-3 pb-1.5 border-b border-current/5 first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => <h3 className="text-base font-bold mt-6 mb-2 first:mt-0">{children}</h3>,
  h4: ({ children }) => (
    <h4 className="text-sm font-bold uppercase tracking-wider text-current/70 mt-5 mb-2 first:mt-0">{children}</h4>
  ),
  p: ({ children }) => <p className="my-3 leading-7 text-[15px]">{children}</p>,
  a: PlainLink,
  ul: ({ children }) => <ul className="my-3 pl-6 list-disc space-y-1.5 marker:text-current/40">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 pl-6 list-decimal space-y-1.5 marker:text-current/40">{children}</ol>,
  li: ({ children }) => <li className="leading-7 text-[15px] pl-1">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l-4 border-current/15 pl-4 italic text-current/70">{children}</blockquote>
  ),
  hr: () => <hr className="my-8 border-current/10" />,
  strong: ({ children }) => <strong className="font-bold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="line-through text-current/50">{children}</del>,
  code: ({ className, children }) => {
    // react-markdown gives fenced blocks a `language-*` class and leaves inline
    // code without one; the block styling lives on <pre> below.
    const isBlock = /language-/.test(className || '');
    if (isBlock) return <code className="font-mono text-[13px] leading-relaxed">{children}</code>;
    return (
      <code className="font-mono text-[13px] bg-current/[0.06] text-current/85 rounded px-1.5 py-0.5 break-words">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-4 bg-surfaceSunken text-textPrimary border border-border rounded-xl p-4 overflow-x-auto shadow-inner custom-scrollbar">{children}</pre>
  ),
  // Tables come from remark-gfm. Wrapped so a wide table scrolls inside itself
  // rather than stretching the whole pane.
  table: ({ children }) => (
    <div className="my-5 overflow-x-auto rounded-xl border border-current/10">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-current/[0.04]">{children}</thead>,
  th: ({ children }) => (
    <th className="text-left font-black uppercase tracking-wider text-[11px] px-3 py-2 border-b border-current/10">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="px-3 py-2 border-b border-current/5 align-top">{children}</td>,
  input: ({ checked, type }) =>
    // GFM task lists. Rendered read-only — this is a document, not a form.
    type === 'checkbox' ? (
      <input type="checkbox" checked={!!checked} readOnly className="mr-2 align-middle accent-current/60" />
    ) : null,
  img: ({ src, alt }) => (
    <img src={typeof src === 'string' ? src : undefined} alt={alt || ''} className="my-4 max-w-full rounded-lg" />
  ),
};

export default function MarkdownView({
  source,
  assetDownloads = false,
}: {
  source: string;
  /**
   * Render `/api/assets/download/...` paths as download buttons. Opt-in, and
   * deliberately off for uploaded documents: a .md any user can upload should
   * not be able to draw a convincing download control on this origin.
   */
  assetDownloads?: boolean;
}) {
  const body = assetDownloads ? linkifyAssets(source) : source;

  const merged = React.useMemo<Components>(
    () =>
      assetDownloads
        ? {
            ...components,
            a: ({ href, children }) =>
              href?.startsWith(ASSET_PREFIX) ? (
                <AssetDownload href={href} />
              ) : (
                <PlainLink href={href}>{children}</PlainLink>
              ),
          }
        : components,
    [assetDownloads],
  );

  return (
    <div className="text-current/85">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={merged}>
        {body}
      </ReactMarkdown>
    </div>
  );
}
