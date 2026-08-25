/**
 * How a stored asset should be previewed.
 *
 * Every call site used to decide this with `isPdf ? 'pdf' : 'image'`, which
 * meant a .md, .docx or .pages file was loaded into an <img> tag and rendered
 * as nothing at all — the file was there and downloadable, it just silently
 * showed blank.
 */
export type PreviewKind = 'image' | 'pdf' | 'text' | 'file';

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'svg'];
/** Renderable as plain text. Markdown is shown as source, not formatted. */
const TEXT_EXT = ['md', 'markdown', 'txt', 'csv', 'log', 'json', 'yml', 'yaml'];

/** The extension of a key or URL, ignoring any query string. */
export function extensionOf(source: string): string {
	const path = source.split(/[?#]/)[0];
	const name = path.slice(path.lastIndexOf('/') + 1);
	const dot = name.lastIndexOf('.');
	return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

/** The filename of a key or URL, decoded, for download prompts. */
export function filenameOf(source: string): string {
	const path = source.split(/[?#]/)[0];
	const name = path.slice(path.lastIndexOf('/') + 1);
	try {
		return decodeURIComponent(name) || 'download';
	} catch {
		return name || 'download';
	}
}

/**
 * Picks a preview mode from the object key (or URL) and, when known, the stored
 * MIME type. Anything not confidently renderable falls back to `file`, which
 * offers a download rather than a blank frame.
 */
export function previewTypeFor(source: string | null | undefined, mimeType?: string | null): PreviewKind {
	if (!source) return 'file';

	const mime = (mimeType || '').toLowerCase();
	if (mime.startsWith('image/')) return 'image';
	if (mime === 'application/pdf') return 'pdf';
	if (mime.startsWith('text/')) return 'text';

	const ext = extensionOf(source);
	if (ext === 'pdf') return 'pdf';
	if (IMAGE_EXT.includes(ext)) return 'image';
	if (TEXT_EXT.includes(ext)) return 'text';
	return 'file';
}
