/**
 * The mail sanitiser and the sandbox contract.
 *
 * Lifted out of `components/MailHtml.tsx` so the security-critical half has no React
 * or DOM import at module scope and can therefore be imported — and asserted on — by
 * the Worker test pool. `sanitiseMail` touches `DOMParser` inside its body only, so
 * importing this module where there is no DOM is safe; calling that one function is
 * not. See `test/mail-html.test.ts`, which pins the two sandbox rules.
 */

/* ── Sanitiser ──────────────────────────────────────────────────────────────── */

export const ALLOWED_TAGS = new Set([
	'a', 'abbr', 'b', 'big', 'blockquote', 'br', 'caption', 'center', 'code', 'col',
	'colgroup', 'dd', 'del', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'font',
	'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'ins', 'li', 'mark', 'ol',
	'p', 'pre', 's', 'small', 'span', 'strike', 'strong', 'sub', 'sup', 'table',
	'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul', 'wbr',
]);

/**
 * Dropped with their subtrees rather than unwrapped.
 *
 * `<style>` is here because a stylesheet is a program enough to matter: attribute
 * selectors plus `@font-face` are a known exfiltration primitive, and `position`
 * games are how a message covers the app's own UI. Inline `style` survives,
 * filtered, which is what carries the formatting people actually send.
 */
export const DROP_ENTIRELY = new Set([
	'script', 'style', 'iframe', 'object', 'embed', 'applet', 'link', 'meta', 'base',
	'form', 'input', 'button', 'select', 'textarea', 'option', 'svg', 'math', 'title',
	'noscript', 'template', 'frame', 'frameset', 'audio', 'video', 'source', 'track',
	'portal',
]);

export const GLOBAL_ATTRS = new Set(['align', 'dir', 'title', 'valign']);

export const TAG_ATTRS: Record<string, Set<string>> = {
	a: new Set(['href']),
	img: new Set(['src', 'alt', 'width', 'height']),
	td: new Set(['colspan', 'rowspan', 'width', 'height', 'bgcolor', 'nowrap']),
	th: new Set(['colspan', 'rowspan', 'width', 'height', 'bgcolor', 'nowrap']),
	table: new Set(['width', 'border', 'cellpadding', 'cellspacing', 'bgcolor']),
	tr: new Set(['bgcolor']),
	col: new Set(['span', 'width']),
	colgroup: new Set(['span', 'width']),
	font: new Set(['color', 'face', 'size']),
	ol: new Set(['start', 'type']),
};

/** Properties that cannot be used to exfiltrate, overlay, or load a resource. */
export const ALLOWED_CSS = new Set([
	'background-color', 'border', 'border-bottom', 'border-collapse', 'border-color',
	'border-left', 'border-radius', 'border-right', 'border-spacing', 'border-style',
	'border-top', 'border-width', 'color', 'font', 'font-family', 'font-size',
	'font-style', 'font-variant', 'font-weight', 'height', 'letter-spacing',
	'line-height', 'list-style', 'list-style-type', 'margin', 'margin-bottom',
	'margin-left', 'margin-right', 'margin-top', 'max-height', 'max-width',
	'min-height', 'min-width', 'padding', 'padding-bottom', 'padding-left',
	'padding-right', 'padding-top', 'text-align', 'text-decoration', 'text-indent',
	'text-transform', 'vertical-align', 'white-space', 'width', 'word-break',
	'word-wrap',
]);

/**
 * A URL is safe if its scheme is one we intend.
 *
 * Checked after stripping control characters and whitespace, because a tab inside
 * `java<TAB>script:` is the same URL to a browser and a different string to a naive
 * `startsWith`.
 */
export function safeUrl(raw: string, allow: string[]): string | null {
	const flat = raw.replace(/[\s\p{Cc}\p{Cf}]/gu, '').toLowerCase();
	if (flat.startsWith('//')) return allow.includes('https:') ? raw : null;
	if (!/^[a-z][a-z0-9+.-]*:/.test(flat)) return raw; // relative — no scheme to abuse
	const scheme = flat.slice(0, flat.indexOf(':') + 1);
	return allow.includes(scheme) ? raw : null;
}

function filterStyle(value: string): string {
	return value
		.split(';')
		.map((decl) => {
			const i = decl.indexOf(':');
			if (i < 0) return '';
			const prop = decl.slice(0, i).trim().toLowerCase();
			const val = decl.slice(i + 1).trim();
			if (!ALLOWED_CSS.has(prop)) return '';
			// No property on the list legitimately needs a URL or a function call that
			// fetches one; both are how CSS becomes a network request.
			if (/url\s*\(|expression\s*\(|\\/i.test(val)) return '';
			return `${prop}: ${val}`;
		})
		.filter(Boolean)
		.join('; ');
}

export interface InlineAttachment {
	id: string;
	contentId: string | null;
	disposition: string;
	url: string;
	contentType: string | null;
}

export interface SanitiseResult {
	html: string;
	/** How many remote images were withheld, for the banner. */
	blockedRemote: number;
}

/** `<abc@host>` and `abc@host` name the same part. Compared lowercased. */
export const bareCid = (v: string) => v.replace(/^<|>$/g, '').toLowerCase();

/**
 * Parses with `DOMParser`, which produces an **inert** document: nothing executes
 * and no subresource is fetched while we walk it. That is what makes it safe to do
 * this in the parent at all — the alternative, a regex over markup, is the approach
 * that has never once held.
 */
export function sanitiseMail(
	raw: string,
	opts: { allowRemote: boolean; cids: Map<string, string> },
): SanitiseResult {
	const doc = new DOMParser().parseFromString(raw, 'text/html');
	let blockedRemote = 0;

	const walk = (node: Element) => {
		for (const child of Array.from(node.children)) {
			const tag = child.tagName.toLowerCase();

			if (DROP_ENTIRELY.has(tag)) { child.remove(); continue; }

			if (!ALLOWED_TAGS.has(tag)) {
				// Unknown but harmless: keep the text, drop the element. A tag we forgot
				// should not silently delete a paragraph.
				const span = doc.createElement('span');
				while (child.firstChild) span.appendChild(child.firstChild);
				child.replaceWith(span);
				walk(span);
				continue;
			}

			for (const attr of Array.from(child.attributes)) {
				const name = attr.name.toLowerCase();
				const permitted = GLOBAL_ATTRS.has(name)
					|| name === 'style'
					|| TAG_ATTRS[tag]?.has(name);

				// Every `on*` handler, every `xmlns`, every `srcset`, every `formaction`.
				if (!permitted) { child.removeAttribute(attr.name); continue; }

				if (name === 'style') {
					const filtered = filterStyle(attr.value);
					if (filtered) child.setAttribute('style', filtered);
					else child.removeAttribute('style');
					continue;
				}

				if (tag === 'a' && name === 'href') {
					const url = safeUrl(attr.value, ['http:', 'https:', 'mailto:']);
					if (url) child.setAttribute('href', url);
					else child.removeAttribute('href');
					continue;
				}

				if (tag === 'img' && name === 'src') {
					const v = attr.value.trim();
					if (/^cid:/i.test(v)) {
						const resolved = opts.cids.get(bareCid(v.slice(4)));
						if (resolved) child.setAttribute('src', resolved);
						else { child.removeAttribute('src'); child.setAttribute('data-missing', '1'); }
						continue;
					}
					if (/^data:image\//i.test(v)) { child.setAttribute('src', v); continue; }
					const url = safeUrl(v, ['http:', 'https:']);
					if (!url) { child.removeAttribute('src'); continue; }
					if (opts.allowRemote) child.setAttribute('src', url);
					else {
						// Held back, not deleted: the alt text and the layout box survive, so
						// the reader can see that something was withheld.
						child.removeAttribute('src');
						child.setAttribute('data-blocked', '1');
						blockedRemote += 1;
					}
					continue;
				}
			}

			if (tag === 'a') {
				child.setAttribute('target', '_blank');
				child.setAttribute('rel', 'noopener noreferrer nofollow');
			}

			walk(child);
		}
	};

	walk(doc.body);
	return { html: doc.body.innerHTML, blockedRemote };
}

/* ── The frame ──────────────────────────────────────────────────────────────── */

/**
 * The sandbox, as one constant so there is a single place to read and to test.
 *
 * `allow-popups` is what lets a link in a message open at all; without it a click
 * does nothing, which reads as a broken app.
 * `allow-popups-to-escape-sandbox` makes the opened tab an ordinary page rather than
 * another opaque-origin sandbox — it grants the *destination* nothing it would not
 * have if the link were pasted into the address bar.
 *
 * Note what is absent, and keep it absent: `allow-scripts`, `allow-same-origin`,
 * `allow-forms`, `allow-modals`, `allow-top-navigation`.
 */
export const MAIL_SANDBOX = 'allow-popups allow-popups-to-escape-sandbox';

/**
 * Belt to the sandbox's braces, and the thing that actually blocks remote images.
 *
 * `default-src 'none'` means a rule has to be added for anything to load at all, so
 * the failure mode of forgetting one is a missing resource rather than a fetched one.
 */
export function mailCsp(allowRemote: boolean): string {
	const img = allowRemote ? 'data: https:' : 'data:';
	return [
		"default-src 'none'",
		`img-src ${img}`,
		"style-src 'unsafe-inline'",
		"font-src 'none'",
		"form-action 'none'",
		"frame-ancestors 'none'",
	].join('; ');
}
