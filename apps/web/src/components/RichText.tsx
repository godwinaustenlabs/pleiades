import { useEffect, useRef } from 'react';
import {
  Bold, Italic, Underline, List, ListOrdered, Link2, Quote, Eraser,
} from 'lucide-react';
import { sanitiseMail } from '../lib/mail-safety';

/**
 * The rich-text body of the composer.
 *
 * ## Why `execCommand`, which is deprecated
 *
 * Because the replacement does not exist. `document.execCommand` is deprecated in the
 * spec and implemented everywhere; doing bold-the-selection without it means
 * reimplementing selection-aware DOM surgery over `Range`, which is a library, not a
 * component. Every lightweight editor in production still does this. The deprecation
 * risk is contained by what this produces — ordinary `<b>`/`<i>` HTML that any mail
 * client renders — so if it is ever removed, the replacement swaps in behind an
 * unchanged output contract.
 *
 * ## The DOM is the state, and that is deliberate
 *
 * A `contentEditable` whose `innerHTML` is re-set from a prop on every keystroke moves
 * the caret to the start on every keystroke. So the element is written once on mount
 * and never re-rendered from props afterwards; edits flow outward through `onChange`.
 * This is the one place in the app where React is not the source of truth, and the
 * `key` on the parent's usage is what forces a genuine reset when a different draft is
 * opened.
 *
 * ## Paste is the security-relevant part
 *
 * Copying out of a webmail client or a web page brings that page's HTML with it —
 * including, if the source was hostile, script and handlers. It goes through
 * `sanitiseMail`, the same allowlist that renders incoming mail, so formatting
 * survives and nothing executable does. That matters even though this is outbound:
 * the draft is stored, and we render our own sent mail.
 */

interface Props {
  /** Initial HTML. Read once, on mount — see the header. */
  initialHtml: string;
  onChange: (v: { html: string; text: string }) => void;
  placeholder?: string;
}

const FONTS = [
  { label: 'Default', value: '' },
  { label: 'Sans', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Mono', value: '"Courier New", Courier, monospace' },
];

/** `fontSize` takes the old 1–7 scale, which is what maps onto `<font size>`. */
const SIZES = [
  { label: 'Small', value: '2' },
  { label: 'Normal', value: '3' },
  { label: 'Large', value: '5' },
  { label: 'Huge', value: '6' },
];

export default function RichText({ initialHtml, onChange, placeholder }: Props) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // Sanitised on the way in too: a draft's stored HTML is only as trustworthy as
    // whatever was pasted into it last time.
    el.innerHTML = initialHtml
      ? sanitiseMail(initialHtml, { allowRemote: true, cids: new Map() }).html
      : '';
    // Intentionally mount-only. Re-running this on an `initialHtml` change would
    // reset the caret mid-sentence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = () => {
    const el = box.current;
    if (!el) return;
    onChange({ html: el.innerHTML, text: el.innerText });
  };

  /**
   * `execCommand` acts on the current selection, and clicking a toolbar button moves
   * focus out of the editor — which collapses that selection. Re-focusing first is
   * what makes a button apply to the words you had highlighted.
   */
  const run = (cmd: string, value?: string) => {
    box.current?.focus();
    document.execCommand(cmd, false, value);
    emit();
  };

  const link = () => {
    const url = window.prompt('Link to:', 'https://');
    if (!url) return;
    // Only schemes that cannot execute. `javascript:` here would be stored in the
    // draft and rendered back to us later.
    if (!/^(https?:|mailto:)/i.test(url.trim())) {
      window.alert('Links must start with http://, https:// or mailto:');
      return;
    }
    run('createLink', url.trim());
  };

  const btn = 'shrink-0 rounded p-1.5 text-textSecondary transition-colors hover:bg-surface active:scale-95';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Scrolls rather than wraps: a wrapping toolbar changes height as the window
          narrows, and on a full-height composer that height comes out of the body. */}
      <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-y border-border bg-surfaceAlt px-2 py-1.5">
        <button type="button" onClick={() => run('bold')} title="Bold" className={btn}><Bold className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={() => run('italic')} title="Italic" className={btn}><Italic className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={() => run('underline')} title="Underline" className={btn}><Underline className="h-3.5 w-3.5" /></button>

        <span className="mx-1 h-4 w-px shrink-0 bg-border" />

        <button type="button" onClick={() => run('insertUnorderedList')} title="Bulleted list" className={btn}><List className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={() => run('insertOrderedList')} title="Numbered list" className={btn}><ListOrdered className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={() => run('formatBlock', 'blockquote')} title="Quote" className={btn}><Quote className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={link} title="Insert link" className={btn}><Link2 className="h-3.5 w-3.5" /></button>

        <span className="mx-1 h-4 w-px shrink-0 bg-border" />

        <select
          defaultValue=""
          onChange={(e) => { if (e.target.value) run('fontName', e.target.value); e.currentTarget.selectedIndex = 0; }}
          title="Font"
          className="shrink-0 rounded border border-border bg-surface px-1.5 py-1 text-[11px] text-textPrimary outline-none"
        >
          <option value="">Font</option>
          {FONTS.filter((f) => f.value).map((f) => <option key={f.label} value={f.value}>{f.label}</option>)}
        </select>
        <select
          defaultValue=""
          onChange={(e) => { if (e.target.value) run('fontSize', e.target.value); e.currentTarget.selectedIndex = 0; }}
          title="Size"
          className="shrink-0 rounded border border-border bg-surface px-1.5 py-1 text-[11px] text-textPrimary outline-none"
        >
          <option value="">Size</option>
          {SIZES.map((f) => <option key={f.label} value={f.value}>{f.label}</option>)}
        </select>

        <span className="mx-1 h-4 w-px shrink-0 bg-border" />
        <button type="button" onClick={() => run('removeFormat')} title="Clear formatting" className={btn}><Eraser className="h-3.5 w-3.5" /></button>
      </div>

      <div
        ref={box}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Message body"
        data-placeholder={placeholder ?? 'Write your message…'}
        onInput={emit}
        onBlur={emit}
        onPaste={(e) => {
          const htmlPart = e.clipboardData.getData('text/html');
          if (!htmlPart) return; // plain text pastes as itself, with nothing to strip
          e.preventDefault();
          const clean = sanitiseMail(htmlPart, { allowRemote: true, cids: new Map() }).html;
          document.execCommand('insertHTML', false, clean);
          emit();
        }}
        className="rich-body min-h-0 flex-1 overflow-y-auto px-4 py-3 leading-relaxed text-textPrimary outline-none sm:min-h-[12rem]"
      />
    </div>
  );
}
