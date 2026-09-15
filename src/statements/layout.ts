import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';

/**
 * A small typographic kit for financial statements, over pdf-lib.
 *
 * pdf-lib rather than a rendering service: it is pure JavaScript, runs inside
 * the Worker with no binding and no network call, and embeds the standard
 * fonts. Nothing in the app generated a PDF before this — the buttons labelled
 * "Generate PDF" open the browser's print dialog, and `react-pdf` is a viewer.
 *
 * The rules here are the ones that make a statement readable: money right-
 * aligned in a monospaced face so digits line up, a rule under each total, and
 * a page break that never separates a heading from its first line.
 */

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 56;
const INK = rgb(0.08, 0.09, 0.11);
const MUTED = rgb(0.42, 0.45, 0.5);
const RULE = rgb(0.78, 0.8, 0.83);
const ZEBRA = rgb(0.965, 0.97, 0.977);

/** The content width between the margins. Column widths must sum to this. */
export const CONTENT_WIDTH = A4.width - MARGIN * 2;

/**
 * Characters the standard fonts cannot draw, mapped or dropped.
 *
 * pdf-lib's standard fonts are WinAnsi-encoded and `drawText` *throws* on a
 * codepoint outside that set. A statement only ever drew account names, which
 * are near enough always ASCII; a journal report draws free-text descriptions
 * typed by people, where a curly quote, an en dash or an emoji is ordinary. An
 * exception there would fail the whole report — and would fail it only for the
 * date ranges that happen to contain the offending entry, which is the worst
 * possible shape for a bug.
 *
 * The common punctuation is mapped to its ASCII equivalent so the text still
 * reads correctly; anything else becomes `?`, which is visible and honest
 * rather than silently deleted. Newlines and tabs collapse to spaces: this kit
 * lays out single-line cells, and a stray newline would draw a second line over
 * whatever the layout had planned for that space.
 */
const TRANSLIT: Record<string, string> = {
  '\u2018': "'", '\u2019': "'", '\u201a': ',', '\u201b': "'",
  '\u201c': '"', '\u201d': '"', '\u201e': '"',
  '\u2010': '-', '\u2011': '-', '\u2012': '-', '\u2013': '-', '\u2014': '-', '\u2015': '-',
  '\u2022': '*', '\u2026': '...', '\u00a0': ' ', '\u2009': ' ', '\u202f': ' ',
  '\u2039': '<', '\u203a': '>', '\u00ab': '<<', '\u00bb': '>>',
  '\u20a8': 'Rs', '\u20b9': 'Rs', '\u2212': '-', '\u00d7': 'x',
};

export function sanitise(input: unknown): string {
  const raw = input == null ? '' : String(input);
  let out = '';
  for (const ch of raw.replace(/[\r\n\t\f\v]+/g, ' ')) {
    const mapped = TRANSLIT[ch];
    if (mapped !== undefined) { out += mapped; continue; }
    const code = ch.codePointAt(0)!;
    // Printable ASCII, and the Latin-1 range WinAnsi shares with Unicode.
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa1 && code <= 0xff)) { out += ch; continue; }
    // `for..of` iterates whole codepoints, so an astral character such as an
    // emoji is one `ch` here and becomes one `?` rather than two.
    out += '?';
  }
  return out;
}

/** A column in a report table. */
export interface Column {
  header: string;
  /** Width in points. The sum should be CONTENT_WIDTH. */
  width: number;
  align?: 'left' | 'right';
  /** Draw values in the monospaced face, so figures line up digit for digit. */
  mono?: boolean;
}

/** One cell. A number is formatted as money; `null` prints nothing. */
export type Cell = string | number | null;

export interface RowOptions {
  /** A totals row: bold, ruled above. */
  bold?: boolean;
  /** Dimmed — used for the "and N more" continuation note inside a table. */
  muted?: boolean;
}

export interface DocMeta {
  /** e.g. "Profit and Loss Account" */
  title: string;
  /** e.g. "For the period 1 July 2025 to 30 June 2026" */
  subtitle: string;
  organisation: string;
  currency: string;
  /** Who or what asked for it, and from where the figures came. */
  provenance: string;
  /** Stamped across every page. Statements are drafts until a person signs one. */
  draft: boolean;
}

/**
 * Money, grouped and to two places, with a leading minus rather than brackets.
 *
 * Exported because a ledger's running balance is not a bare number — it is a
 * figure and a side ("1,234.56 Dr") — and building that string outside the
 * renderer must use the same formatting as every figure beside it.
 */
export function formatMoney(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  return `${sign}${abs}`;
}

export class StatementDoc {
  private doc!: PDFDocument;
  private page!: PDFPage;
  private y = 0;
  private body!: PDFFont;
  private bold!: PDFFont;
  private mono!: PDFFont;
  private pageNo = 0;
  /** The table currently being drawn, so its header can repeat on each page. */
  private cols: Column[] | null = null;
  private zebra = false;
  private grouped = false;
  private groupBand = false;

  private constructor(private meta: DocMeta) {}

  static async create(meta: DocMeta): Promise<StatementDoc> {
    const d = new StatementDoc(meta);
    d.doc = await PDFDocument.create();
    d.doc.setTitle(`${meta.title} — ${meta.organisation}`);
    d.doc.setCreator('Pleiades');
    d.body = await d.doc.embedFont(StandardFonts.Helvetica);
    d.bold = await d.doc.embedFont(StandardFonts.HelveticaBold);
    // Courier for figures: proportional digits make columns of money ragged
    // even when they are right-aligned, because the glyphs differ in width.
    d.mono = await d.doc.embedFont(StandardFonts.Courier);
    d.newPage();
    d.titleBlock();
    return d;
  }

  private get right() { return A4.width - MARGIN; }

  private newPage() {
    this.page = this.doc.addPage([A4.width, A4.height]);
    this.pageNo += 1;
    this.y = A4.height - MARGIN;
    if (this.meta.draft) this.draftStamp();
    this.footer();
    // A table that spans pages repeats its header. Without this, page two of a
    // journal report is six unlabelled columns of numbers — and which of the
    // last two is the debit column is exactly the thing a reader needs told.
    if (this.cols) this.tableHeader();
  }

  private draftStamp() {
    // A header band rather than a diagonal watermark: it survives printing in
    // black and white, and it cannot be mistaken for decoration.
    this.page.drawRectangle({
      x: 0, y: A4.height - 20, width: A4.width, height: 20,
      color: rgb(0.99, 0.93, 0.8),
    });
    this.page.drawText('DRAFT — not filed with any authority', {
      x: MARGIN, y: A4.height - 14, size: 8, font: this.bold, color: rgb(0.55, 0.36, 0.02),
    });
  }

  private footer() {
    this.page.drawText(sanitise(this.meta.provenance), {
      x: MARGIN, y: 28, size: 7, font: this.body, color: MUTED,
      maxWidth: A4.width - MARGIN * 2, lineHeight: 9,
    });
    this.page.drawText(`Page ${this.pageNo}`, {
      x: this.right - 40, y: 28, size: 7, font: this.body, color: MUTED,
    });
  }

  private titleBlock() {
    this.y -= 14;
    this.page.drawText(this.fit(this.meta.organisation, this.bold, 10, CONTENT_WIDTH), {
      x: MARGIN, y: this.y, size: 10, font: this.bold, color: MUTED,
    });
    this.y -= 24;
    this.page.drawText(this.fit(this.meta.title, this.bold, 20, CONTENT_WIDTH), { x: MARGIN, y: this.y, size: 20, font: this.bold, color: INK });
    this.y -= 16;
    this.page.drawText(this.fit(this.meta.subtitle, this.body, 10, CONTENT_WIDTH), { x: MARGIN, y: this.y, size: 10, font: this.body, color: MUTED });
    this.y -= 8;
    this.rule();
    this.y -= 14;
  }

  /** Breaks the page when less than `needed` points remain. */
  private ensure(needed: number) {
    if (this.y - needed < 70) this.newPage();
  }

  /** Text width, measured on the sanitised string that will actually be drawn. */
  private widthOf(text: string, font: PDFFont, size: number) {
    return font.widthOfTextAtSize(sanitise(text), size);
  }

  /**
   * Truncates to a measured width rather than to a character count.
   *
   * `label.slice(0, 42)` is only correct for a monospaced face: in Helvetica
   * 42 capital Ws are nearly three times the width of 42 lowercase i's, so a
   * fixed count either overflows into the next column or wastes half of it.
   */
  private fit(text: string, font: PDFFont, size: number, maxWidth: number): string {
    const clean = sanitise(text);
    if (font.widthOfTextAtSize(clean, size) <= maxWidth) return clean;
    const ellipsis = '...';
    const room = maxWidth - font.widthOfTextAtSize(ellipsis, size);
    if (room <= 0) return '';
    let lo = 0;
    let hi = clean.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (font.widthOfTextAtSize(clean.slice(0, mid), size) <= room) lo = mid;
      else hi = mid - 1;
    }
    return clean.slice(0, lo).trimEnd() + ellipsis;
  }

  private rule(weight = 0.6, color = RULE) {
    this.page.drawLine({
      start: { x: MARGIN, y: this.y }, end: { x: this.right, y: this.y },
      thickness: weight, color,
    });
  }

  private money(n: number): string {
    return formatMoney(n);
  }

  private drawAmount(value: number, size: number, font: PDFFont) {
    const text = this.money(value);
    const w = font.widthOfTextAtSize(text, size);
    this.page.drawText(text, { x: this.right - w, y: this.y, size, font, color: INK });
  }

  /** A section heading. Never left stranded at the foot of a page. */
  section(label: string) {
    this.closeTable();
    this.ensure(52);
    this.y -= 10;
    this.page.drawText(sanitise(label).toUpperCase(), {
      x: MARGIN, y: this.y, size: 9, font: this.bold, color: MUTED,
    });
    this.y -= 6;
    this.rule(0.4);
    this.y -= 14;
  }

  line(label: string, amount: number) {
    this.closeTable();
    this.ensure(18);
    this.page.drawText(this.fit(label, this.body, 10, CONTENT_WIDTH - 140), { x: MARGIN + 8, y: this.y, size: 10, font: this.body, color: INK });
    this.drawAmount(amount, 10, this.mono);
    this.y -= 16;
  }

  /** A totalled line: ruled above, bold, and double-ruled when it is the answer. */
  total(label: string, amount: number, emphatic = false) {
    this.closeTable();
    this.ensure(30);
    this.y += 4;
    this.rule(emphatic ? 0.9 : 0.5);
    this.y -= 14;
    this.page.drawText(this.fit(label, this.bold, 10, CONTENT_WIDTH - 140), { x: MARGIN + 8, y: this.y, size: 10, font: this.bold, color: INK });
    this.drawAmount(amount, 10, emphatic ? this.bold : this.mono);
    this.y -= 6;
    if (emphatic) { this.rule(0.9); this.y -= 4; }
    this.y -= 10;
  }

  /** Free text: a note, a caveat, an explanation of why a figure is missing. */
  note(text: string) {
    this.closeTable();
    this.ensure(28);
    this.page.drawText(sanitise(text), {
      x: MARGIN, y: this.y, size: 8.5, font: this.body, color: MUTED,
      maxWidth: this.right - MARGIN, lineHeight: 11,
    });
    // One line per ~95 characters at this size and width.
    this.y -= 12 * Math.max(1, Math.ceil(text.length / 95)) + 6;
  }

  /** A three-column table, used for the asset register. */
  table(headers: [string, string, string, string], rows: [string, number, number, number][]) {
    this.closeTable();
    this.ensure(40);
    const cols = [MARGIN + 8, this.right - 300, this.right - 165, this.right];
    this.page.drawText(sanitise(headers[0]), { x: cols[0], y: this.y, size: 8, font: this.bold, color: MUTED });
    for (let i = 1; i < 4; i++) {
      const w = this.bold.widthOfTextAtSize(headers[i], 8);
      this.page.drawText(sanitise(headers[i]), { x: cols[i] - w, y: this.y, size: 8, font: this.bold, color: MUTED });
    }
    this.y -= 6;
    this.rule(0.4);
    this.y -= 13;

    for (const [label, ...values] of rows) {
      this.ensure(16);
      this.page.drawText(this.fit(label, this.body, 9, 190), { x: cols[0], y: this.y, size: 9, font: this.body, color: INK });
      values.forEach((v, i) => {
        const text = this.money(v);
        const w = this.mono.widthOfTextAtSize(text, 9);
        this.page.drawText(text, { x: cols[i + 1] - w, y: this.y, size: 9, font: this.mono, color: INK });
      });
      this.y -= 14;
    }
  }

  /**
   * A sub-heading inside a section — one account within an all-ledgers report.
   *
   * Kept with at least the first two rows beneath it: a heading alone at the
   * foot of a page tells the reader an account is coming and then makes them
   * turn over to find out which figures belong to it.
   */
  subheading(label: string, right?: string) {
    this.closeTable();
    this.ensure(72);
    this.y -= 8;
    this.page.drawText(this.fit(label, this.bold, 11, CONTENT_WIDTH - 160), {
      x: MARGIN, y: this.y, size: 11, font: this.bold, color: INK,
    });
    if (right) {
      const w = this.widthOf(right, this.body, 9);
      this.page.drawText(sanitise(right), {
        x: this.right - w, y: this.y, size: 9, font: this.body, color: MUTED,
      });
    }
    this.y -= 6;
    this.rule(0.4);
    this.y -= 12;
  }

  /* ── Tables ──────────────────────────────────────────────────────────────
   *
   * Opened rather than drawn in one call, so a caller can interleave rows with
   * sub-totals and so the renderer can repeat the header whenever the page
   * breaks. `beginTable` / `row` / `endTable`; `closeTable` is idempotent and
   * every other block-level method calls it, so forgetting to end one cannot
   * leave a header repeating over unrelated content.
   */

  /**
   * @param grouped Band by group rather than by row — see `nextGroup`.
   */
  beginTable(cols: Column[], grouped = false) {
    this.cols = cols;
    this.zebra = false;
    this.grouped = grouped;
    this.groupBand = true;
    // 34pt is the header plus two rows: a header stranded at the foot of a
    // page is the same defect as a stranded sub-heading.
    this.ensure(52);
    this.tableHeader();
  }

  private tableHeader() {
    const cols = this.cols;
    if (!cols) return;
    let x = MARGIN;
    for (const col of cols) {
      const text = this.fit(col.header, this.bold, 7.5, col.width - 6);
      const w = this.bold.widthOfTextAtSize(text, 7.5);
      this.page.drawText(text, {
        x: col.align === 'right' ? x + col.width - w : x,
        y: this.y, size: 7.5, font: this.bold, color: MUTED,
      });
      x += col.width;
    }
    this.y -= 5;
    this.rule(0.5);
    this.y -= 12;
  }

  row(cells: Cell[], opts: RowOptions = {}) {
    const cols = this.cols;
    if (!cols) throw new Error('row() called with no table open');

    this.ensure(15);
    const size = 8;
    const font = opts.bold ? this.bold : this.body;
    const colour = opts.muted ? MUTED : INK;

    if (opts.bold) {
      this.y += 3;
      this.rule(0.5);
      this.y -= 12;
    } else {
      // Banding rather than a rule per row: 60 hairlines to a page is a grid,
      // and a grid is harder to read across than an unbroken line of text.
      // In grouped mode the band is set per group, not per row — a journal
      // entry of three lines has to read as one thing, and striping its lines
      // individually says the opposite.
      if (this.grouped) this.zebra = this.groupBand;
      else this.zebra = !this.zebra;
      if (this.zebra) {
        this.page.drawRectangle({
          x: MARGIN - 3, y: this.y - 3.5, width: CONTENT_WIDTH + 6, height: 13, color: ZEBRA,
        });
      }
    }

    let x = MARGIN;
    cells.forEach((cell, i) => {
      const col = cols[i];
      if (!col || cell === null || cell === undefined || cell === '') { x += col?.width ?? 0; return; }
      const isNumber = typeof cell === 'number';
      const face = col.mono || isNumber ? (opts.bold ? this.bold : this.mono) : font;
      const text = isNumber
        ? this.money(cell)
        : this.fit(String(cell), face, size, col.width - 6);
      const w = face.widthOfTextAtSize(text, size);
      const alignRight = col.align === 'right' || isNumber;
      this.page.drawText(text, {
        x: alignRight ? x + col.width - w - 2 : x,
        y: this.y, size, font: face, color: colour,
      });
      x += col.width;
    });

    this.y -= 13;
    if (opts.bold) { this.y -= 3; }
  }

  /**
   * A full-width line inside an open table.
   *
   * The narration under a journal entry, and the notice that a listing was
   * abbreviated. Both are prose, and squeezing prose into a 217-point
   * Particulars column truncates the half that carries the meaning — so they
   * get the whole width and wrap, while the ruled columns keep their grid.
   */
  noteRow(text: string, opts: { indent?: number; maxLines?: number } = {}) {
    if (!this.cols) throw new Error('noteRow() called with no table open');
    const indent = opts.indent ?? 10;
    const maxLines = Math.max(1, opts.maxLines ?? 2);
    const size = 7.5;
    const width = CONTENT_WIDTH - indent;

    // Wrapped by word index, never by character offset into the source. An
    // offset is only valid if the words rejoin exactly as they were split, and
    // they do not: runs of whitespace collapse, so slicing the original by the
    // length of the joined lines lands early and reprints a tail that was
    // already on the page ("Invoice: inv_77a2b1 77a2b1").
    const words = sanitise(text).split(/\s+/).filter(Boolean);
    if (words.length === 0) return;

    const lines: string[] = [];
    let current = words[0];
    let next = 1;
    for (; next < words.length; next++) {
      const candidate = `${current} ${words[next]}`;
      if (this.body.widthOfTextAtSize(candidate, size) <= width) { current = candidate; continue; }
      // On the final permitted line, stop: whatever is left is appended below
      // and truncated by measure, so the reader can see there is more.
      if (lines.length === maxLines - 1) break;
      lines.push(this.fit(current, this.body, size, width));
      current = words[next];
    }

    const remainder = words.slice(next).join(' ');
    lines.push(
      remainder
        ? this.fit(`${current} ${remainder}`, this.body, size, width)
        : this.fit(current, this.body, size, width),
    );

    for (const line of lines) {
      this.ensure(13);
      this.page.drawText(line, {
        x: MARGIN + indent, y: this.y, size, font: this.body, color: MUTED,
      });
      this.y -= 11;
    }
  }

  /**
   * Breaks the page now if `points` of content would not fit on this one.
   *
   * For blocks that must not be split: a journal entry is its debit lines, its
   * credit lines and its narration, and a page break through the middle of one
   * leaves a narration stranded at the top of the next page above an entry it
   * does not describe. Capped below the usable page height, so a block taller
   * than a page breaks once and then simply flows.
   */
  keepTogether(points: number) {
    this.ensure(Math.min(points, 600));
  }

  /** Starts a new banded group: every row until the next call shares a band. */
  nextGroup() {
    this.groupBand = !this.groupBand;
  }

  private closeTable() {
    if (!this.cols) return;
    this.cols = null;
    this.zebra = false;
    this.grouped = false;
    this.y -= 4;
  }

  endTable() {
    this.closeTable();
    this.y -= 8;
  }

  async save(): Promise<Uint8Array> {
    return this.doc.save();
  }
}
