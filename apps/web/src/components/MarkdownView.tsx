import React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Renders markdown for the asset previewer.
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
const components: Components = {
  h1: ({ children }) => (
    <h1 className="text-2xl font-black tracking-tight mt-8 mb-3 pb-2 border-b border-black/10 first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-xl font-black tracking-tight mt-7 mb-3 pb-1.5 border-b border-black/5 first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => <h3 className="text-base font-bold mt-6 mb-2 first:mt-0">{children}</h3>,
  h4: ({ children }) => (
    <h4 className="text-sm font-bold uppercase tracking-wider text-black/70 mt-5 mb-2 first:mt-0">{children}</h4>
  ),
  p: ({ children }) => <p className="my-3 leading-7 text-[15px]">{children}</p>,
  a: ({ href, children }) => (
    // Uploaded documents can link anywhere, so treat every link as untrusted.
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="text-blue-700 underline underline-offset-2 hover:text-blue-900 break-words"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="my-3 pl-6 list-disc space-y-1.5 marker:text-black/40">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 pl-6 list-decimal space-y-1.5 marker:text-black/40">{children}</ol>,
  li: ({ children }) => <li className="leading-7 text-[15px] pl-1">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l-4 border-black/15 pl-4 italic text-black/70">{children}</blockquote>
  ),
  hr: () => <hr className="my-8 border-black/10" />,
  strong: ({ children }) => <strong className="font-bold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="line-through text-black/50">{children}</del>,
  code: ({ className, children }) => {
    // react-markdown gives fenced blocks a `language-*` class and leaves inline
    // code without one; the block styling lives on <pre> below.
    const isBlock = /language-/.test(className || '');
    if (isBlock) return <code className="font-mono text-[13px] leading-relaxed">{children}</code>;
    return (
      <code className="font-mono text-[13px] bg-black/[0.06] text-black/85 rounded px-1.5 py-0.5 break-words">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-4 bg-[#1e1e2e] text-[#e5e7eb] rounded-xl p-4 overflow-x-auto shadow-inner">{children}</pre>
  ),
  // Tables come from remark-gfm. Wrapped so a wide table scrolls inside itself
  // rather than stretching the whole pane.
  table: ({ children }) => (
    <div className="my-5 overflow-x-auto rounded-xl border border-black/10">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-black/[0.04]">{children}</thead>,
  th: ({ children }) => (
    <th className="text-left font-black uppercase tracking-wider text-[11px] px-3 py-2 border-b border-black/10">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="px-3 py-2 border-b border-black/5 align-top">{children}</td>,
  input: ({ checked, type }) =>
    // GFM task lists. Rendered read-only — this is a document, not a form.
    type === 'checkbox' ? (
      <input type="checkbox" checked={!!checked} readOnly className="mr-2 align-middle accent-black/60" />
    ) : null,
  img: ({ src, alt }) => (
    <img src={typeof src === 'string' ? src : undefined} alt={alt || ''} className="my-4 max-w-full rounded-lg" />
  ),
};

export default function MarkdownView({ source }: { source: string }) {
  return (
    <div className="text-black/85">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
