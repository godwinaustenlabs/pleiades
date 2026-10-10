import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent, TextareaHTMLAttributes } from 'react';
import { Mic, Loader2 } from 'lucide-react';
import { Dictation, dictationSupported, spliceDictation } from '../lib/dictation';
import type { DictationPhase } from '../lib/dictation';

/** Held at least this long, the mic is push-to-talk; shorter, it is a toggle. */
const HOLD_MS = 350;

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string;
  onChange: (value: string) => void;
  /** True from the moment the mic opens until the words are written in. */
  onDictatingChange?: (active: boolean) => void;
};

/**
 * A textarea with a microphone. Typing and dictating mix freely: the words land
 * wherever the caret is (or replace the selection), and the caret ends up after
 * them, ready for the keyboard again.
 *
 * Two ways to use the mic, told apart by how long it is pressed:
 * - **hold** — push-to-talk. Speak while holding; letting go writes it in.
 * - **tap** — starts listening hands-free; tap again to finish.
 *
 * While listening the box is read-only and the caret is hidden, and the words
 * stream in as a live preview that corrects itself as more is heard (see
 * lib/dictation.ts). Escape throws the recording away and restores the text.
 */
export default function DictationTextarea({ value, onChange, onDictatingChange, className = '', readOnly, ...rest }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [phase, setPhase] = useState<DictationPhase>('idle');
  const [mode, setMode] = useState<'hold' | 'toggle'>('toggle');
  const [error, setError] = useState('');
  const [supported] = useState(dictationSupported);

  // The callbacks fire long after render; they read the latest props through refs.
  const onChangeRef = useRef(onChange);
  const onActiveRef = useRef(onDictatingChange);
  useEffect(() => {
    onChangeRef.current = onChange;
    onActiveRef.current = onDictatingChange;
  });

  /** The text either side of where the words go, fixed when the mic opens. */
  const anchor = useRef<{ before: string; after: string } | null>(null);
  const lastPreview = useRef('');
  /** Whether the person has put the caret anywhere; if not, dictation appends. */
  const caretPlaced = useRef(false);
  const press = useRef<{ at: number; pending: boolean } | null>(null);

  const placeCaret = (caret: number) => {
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(caret, caret);
      caretPlaced.current = true;
    });
  };

  const dictation = useRef<Dictation | null>(null);
  useEffect(() => {
    const commit = (spoken: string) => {
      const a = anchor.current;
      anchor.current = null;
      if (!a) return;
      const { value: next, caret } = spliceDictation(a.before, spoken, a.after);
      onChangeRef.current(next);
      requestAnimationFrame(() => {
        const el = ref.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(caret, caret);
        caretPlaced.current = true;
      });
    };
    const d = new Dictation({
      onPhase: (p) => {
        setPhase(p);
        onActiveRef.current?.(p !== 'idle');
      },
      onPreview: (text) => {
        const a = anchor.current;
        if (!a) return;
        lastPreview.current = text;
        onChangeRef.current(spliceDictation(a.before, text, a.after).value);
      },
      onFinal: (text) => commit(text),
      onError: (message) => {
        setError(message);
        // Keep whatever was already heard rather than losing it to a failed last pass.
        if (anchor.current) commit(lastPreview.current);
      },
    });
    dictation.current = d;
    return () => d.cancel();
  }, []);

  const begin = () => {
    const el = ref.current;
    const start = caretPlaced.current && el ? el.selectionStart : value.length;
    const end = caretPlaced.current && el ? el.selectionEnd : value.length;
    anchor.current = { before: value.slice(0, start), after: value.slice(end) };
    lastPreview.current = '';
    setError('');
    void dictation.current?.start();
  };

  const finish = () => void dictation.current?.stop();

  const discard = () => {
    const a = anchor.current;
    dictation.current?.cancel();
    anchor.current = null;
    if (a) {
      onChangeRef.current(a.before + a.after);
      placeCaret(a.before.length);
    }
  };

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    // Keep focus and the caret in the textarea; the button is only a trigger.
    e.preventDefault();
    if (phase === 'idle') {
      e.currentTarget.setPointerCapture(e.pointerId);
      press.current = { at: Date.now(), pending: true };
      setMode('toggle');
      begin();
    } else if (phase === 'starting' || phase === 'listening') {
      press.current = null;
      finish();
    }
  };

  const onPointerUp = () => {
    const p = press.current;
    press.current = null;
    if (!p?.pending) return;
    // Released after the mic was live and after a real hold: push-to-talk.
    // Released quickly, or while the permission prompt was still up: a tap.
    if (dictation.current?.current === 'listening' && Date.now() - p.at >= HOLD_MS) finish();
  };

  // Shown as "hold" only once a press has lasted long enough to be one.
  useEffect(() => {
    if (phase !== 'listening' || !press.current?.pending) return;
    const left = HOLD_MS - (Date.now() - press.current.at);
    const t = setTimeout(() => { if (press.current?.pending) setMode('hold'); }, Math.max(0, left));
    return () => clearTimeout(t);
  }, [phase]);

  const onButtonKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (phase === 'idle') {
      setMode('toggle');
      begin();
    } else if (phase === 'starting' || phase === 'listening') finish();
  };

  const onAreaKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (phase !== 'idle' && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      discard();
    }
  };

  const active = phase !== 'idle';
  const listening = phase === 'listening';
  const status =
    phase === 'starting' ? 'Opening the microphone…'
    : listening ? (mode === 'hold' ? 'Listening — let go to write it in' : 'Listening — tap the mic to finish, Esc to discard')
    : phase === 'finishing' ? 'Writing it in…'
    : '';

  return (
    <div>
      <div className="relative">
        <textarea
          {...rest}
          ref={ref}
          value={value}
          readOnly={readOnly || active}
          onChange={(e) => onChange(e.target.value)}
          onFocus={(e) => { caretPlaced.current = true; rest.onFocus?.(e); }}
          onKeyDown={(e) => { onAreaKey(e); rest.onKeyDown?.(e); }}
          aria-busy={active}
          className={`${className} ${supported ? 'pr-14' : ''} ${active ? 'caret-transparent' : ''} ${listening ? 'border-danger/60' : ''}`}
        />
        {supported && (
          <button
            type="button"
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onButtonKey}
            onContextMenu={(e) => e.preventDefault()}
            disabled={readOnly || phase === 'finishing'}
            aria-pressed={listening}
            aria-label={active ? 'Stop dictation' : 'Dictate — hold to talk, or tap to start and stop'}
            title={active ? 'Stop dictation' : 'Hold to talk, or tap to start and stop'}
            className={`absolute bottom-3 right-3 flex h-10 w-10 touch-none select-none items-center justify-center rounded-full transition-all disabled:opacity-60 ${
              listening
                ? 'bg-danger text-white shadow-lg shadow-danger/30 ring-4 ring-danger/25 animate-pulse'
                : 'bg-white/10 text-textSecondary hover:bg-white/15 hover:text-white'
            }`}
          >
            {phase === 'starting' || phase === 'finishing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
          </button>
        )}
      </div>
      <p aria-live="polite" className={`mt-2 min-h-[1rem] text-[11px] font-bold ${error ? 'text-danger' : 'text-textSecondary'}`}>
        {error || status}
      </p>
    </div>
  );
}
