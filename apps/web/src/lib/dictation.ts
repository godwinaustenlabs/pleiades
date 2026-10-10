/**
 * Voice dictation: the recorder, the live-preview loop, and the rules for writing
 * what was said into text that is already there.
 *
 * The server half is `POST /api/dashboard/notes/transcribe`, which is stateless.
 * Everything that makes this feel live is here: while the person speaks, the WHOLE
 * recording so far is re-sent every few seconds, and each answer replaces the
 * previous preview. That is what lets a word heard wrongly at second two be
 * corrected at second six — each pass hears more context — and it needs no
 * streaming socket, which the Worker's 10ms CPU budget would not like.
 *
 * Re-sending everything costs more audio per minute the longer someone talks, so
 * the gap between previews grows with the length of the recording (a quarter of
 * it, never under 1.2s) and only one request is ever in flight. A five-minute note
 * then costs about four times its length in audio rather than growing with the
 * square of it.
 */

import { API, token } from './auth';

/** Recording stops by itself here, so a forgotten open mic cannot run all day. */
export const MAX_RECORDING_MS = 5 * 60_000;
/**
 * Under about a second Whisper invents a word from the noise ("We"), so the
 * first preview waits for two seconds of audio, and a recording shorter than
 * half a second — a mis-tap — is not sent at all.
 */
const FIRST_PREVIEW_MS = 2000;
const MIN_PREVIEW_GAP_MS = 1200;
const PREVIEW_GAP_FRACTION = 0.25;
const MIN_RECORDING_MS = 500;

/* ── Writing it in ─────────────────────────────────────────────────────────── */

/**
 * Writes `spoken` between `before` and `after`, and says where the caret goes.
 *
 * The caret lands at the end of what was said, so typing carries straight on.
 * Spacing is added only where it is missing, and a closing full stop is dropped
 * when the sentence carries on after the words.
 *
 * Capitalisation is left as Whisper gave it. Lowercasing mid-sentence looks right
 * for "the meeting is | On Thursday" and mangles every name ("call | Arham"), and
 * there is no telling the two apart from the text.
 */
export function spliceDictation(
	before: string,
	spoken: string,
	after: string,
): { value: string; caret: number } {
	let text = spoken.trim();
	if (!text) return { value: before + after, caret: before.length };

	// A full stop before more of the same sentence is wrong; before a new one, keep it.
	if (/^\s*[a-z]/.test(after)) text = text.replace(/[.]$/, '');

	const lead = before !== '' && !/\s$/.test(before) ? ' ' : '';
	const trail = after !== '' && !/^[\s.,;:!?)\]]/.test(after) ? ' ' : '';
	const value = before + lead + text + trail + after;
	return { value, caret: before.length + lead.length + text.length };
}

/* ── Recording ─────────────────────────────────────────────────────────────── */

export type DictationPhase = 'idle' | 'starting' | 'listening' | 'finishing';

export interface DictationCallbacks {
	/** A fresh transcription of everything said so far. Replaces the last one. */
	onPreview: (text: string) => void;
	/** The final transcription, after the mic is released. Empty if nothing was said. */
	onFinal: (text: string) => void;
	onPhase: (phase: DictationPhase) => void;
	onError: (message: string) => void;
}

/** The browser's best container: Opus in WebM, or AAC in MP4 on Safari. */
function pickMimeType(): string | undefined {
	if (typeof MediaRecorder === 'undefined') return undefined;
	return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
}

export function dictationSupported(): boolean {
	return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
}

function toBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});
}

async function transcribe(blob: Blob): Promise<string> {
	const res = await fetch(`${API}/dashboard/notes/transcribe`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
		body: JSON.stringify({ audio: await toBase64(blob) }),
	});
	const d = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(d.error || 'Transcription failed');
	return d.data?.text ?? '';
}

/**
 * One recording session at a time. `start()` asks for the mic and begins;
 * `stop()` ends it and delivers `onFinal`; `cancel()` ends it delivering nothing.
 */
export class Dictation {
	private phase: DictationPhase = 'idle';
	private stream: MediaStream | null = null;
	private recorder: MediaRecorder | null = null;
	private chunks: Blob[] = [];
	private startedAt = 0;
	private previewTimer: ReturnType<typeof setTimeout> | null = null;
	private limitTimer: ReturnType<typeof setTimeout> | null = null;
	private previewInFlight = false;
	private sentChunks = 0;
	/** Bumped on every stop/cancel, so a late preview from an old session is dropped. */
	private session = 0;
	private callbacks: DictationCallbacks;

	constructor(callbacks: DictationCallbacks) {
		this.callbacks = callbacks;
	}

	get current(): DictationPhase {
		return this.phase;
	}

	private setPhase(phase: DictationPhase) {
		this.phase = phase;
		this.callbacks.onPhase(phase);
	}

	async start(): Promise<void> {
		if (this.phase !== 'idle') return;
		this.setPhase('starting');
		const session = ++this.session;
		try {
			this.stream = await navigator.mediaDevices.getUserMedia({
				audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
			});
		} catch (err) {
			this.setPhase('idle');
			const denied = err instanceof DOMException && err.name === 'NotAllowedError';
			this.callbacks.onError(denied ? 'Microphone access was blocked. Allow it in the browser to dictate.' : 'No microphone could be opened.');
			return;
		}
		// Cancelled while the permission prompt was open.
		if (session !== this.session) {
			this.releaseMic();
			return;
		}

		const mimeType = pickMimeType();
		this.recorder = new MediaRecorder(this.stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 24_000 });
		this.chunks = [];
		this.sentChunks = 0;
		this.recorder.ondataavailable = (e) => {
			if (e.data.size > 0) this.chunks.push(e.data);
		};
		this.recorder.start(250);
		this.startedAt = Date.now();
		this.setPhase('listening');
		this.schedulePreview(session);
		this.limitTimer = setTimeout(() => void this.stop(), MAX_RECORDING_MS);
	}

	private blob(): Blob {
		return new Blob(this.chunks, { type: this.recorder?.mimeType || this.chunks[0]?.type || 'audio/webm' });
	}

	private schedulePreview(session: number) {
		const elapsed = Date.now() - this.startedAt;
		const gap = elapsed < FIRST_PREVIEW_MS ? FIRST_PREVIEW_MS - elapsed : Math.max(MIN_PREVIEW_GAP_MS, elapsed * PREVIEW_GAP_FRACTION);
		this.previewTimer = setTimeout(async () => {
			if (session !== this.session || this.phase !== 'listening') return;
			if (!this.previewInFlight && this.chunks.length > this.sentChunks) {
				this.previewInFlight = true;
				this.sentChunks = this.chunks.length;
				try {
					const text = await transcribe(this.blob());
					if (session === this.session && this.phase === 'listening') this.callbacks.onPreview(text);
				} catch {
					// A preview is a courtesy; the final pass is what counts.
				} finally {
					this.previewInFlight = false;
				}
			}
			if (session === this.session && this.phase === 'listening') this.schedulePreview(session);
		}, gap);
	}

	/** Ends the recording and transcribes all of it. */
	async stop(): Promise<void> {
		if (this.phase === 'starting') {
			this.cancel();
			return;
		}
		if (this.phase !== 'listening' || !this.recorder) return;
		const session = ++this.session;
		this.clearTimers();
		this.setPhase('finishing');

		const recorder = this.recorder;
		await new Promise<void>((resolve) => {
			recorder.addEventListener('stop', () => resolve(), { once: true });
			recorder.stop();
		});
		this.releaseMic();
		if (session !== this.session) return;

		try {
			const long = Date.now() - this.startedAt >= MIN_RECORDING_MS;
			const text = long && this.chunks.length > 0 ? await transcribe(this.blob()) : '';
			if (session === this.session) this.callbacks.onFinal(text);
		} catch (err) {
			if (session === this.session) this.callbacks.onError(err instanceof Error ? err.message : 'Transcription failed');
		} finally {
			if (session === this.session) {
				this.chunks = [];
				this.setPhase('idle');
			}
		}
	}

	/** Ends everything, delivering nothing. For unmounting mid-recording. */
	cancel(): void {
		this.session++;
		this.clearTimers();
		if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
		this.releaseMic();
		this.chunks = [];
		if (this.phase !== 'idle') this.setPhase('idle');
	}

	private clearTimers() {
		if (this.previewTimer) clearTimeout(this.previewTimer);
		if (this.limitTimer) clearTimeout(this.limitTimer);
		this.previewTimer = this.limitTimer = null;
	}

	private releaseMic() {
		this.stream?.getTracks().forEach((t) => t.stop());
		this.stream = null;
		this.recorder = null;
	}
}
