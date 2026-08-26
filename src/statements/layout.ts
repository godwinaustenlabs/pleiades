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

export class StatementDoc {
  private doc!: PDFDocument;
  private page!: PDFPage;
  private y = 0;
  private body!: PDFFont;
  private bold!: PDFFont;
  private mono!: PDFFont;
  private pageNo = 0;

  private constructor(private meta: DocMeta) {}

  static async create(meta: DocMeta): Promise<StatementDoc> {
    const d = new StatementDoc(meta);
    d.doc = await PDFDocument.create();
    d.doc.setTitle(`${meta.title} — ${meta.organisation}`);
    d.doc.setCreator('officeOS');
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
    this.page.drawText(this.meta.provenance, {
      x: MARGIN, y: 28, size: 7, font: this.body, color: MUTED,
      maxWidth: A4.width - MARGIN * 2, lineHeight: 9,
    });
    this.page.drawText(`Page ${this.pageNo}`, {
      x: this.right - 40, y: 28, size: 7, font: this.body, color: MUTED,
    });
  }

  private titleBlock() {
    this.y -= 14;
    this.page.drawText(this.meta.organisation, {
      x: MARGIN, y: this.y, size: 10, font: this.bold, color: MUTED,
    });
    this.y -= 24;
    this.page.drawText(this.meta.title, { x: MARGIN, y: this.y, size: 20, font: this.bold, color: INK });
    this.y -= 16;
    this.page.drawText(this.meta.subtitle, { x: MARGIN, y: this.y, size: 10, font: this.body, color: MUTED });
    this.y -= 8;
    this.rule();
    this.y -= 14;
  }

  /** Breaks the page when less than `needed` points remain. */
  private ensure(needed: number) {
    if (this.y - needed < 70) this.newPage();
  }

  private rule(weight = 0.6, color = RULE) {
    this.page.drawLine({
      start: { x: MARGIN, y: this.y }, end: { x: this.right, y: this.y },
      thickness: weight, color,
    });
  }

  private money(n: number): string {
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(n).toLocaleString('en-US', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
    return `${sign}${abs}`;
  }

  private drawAmount(value: number, size: number, font: PDFFont) {
    const text = this.money(value);
    const w = font.widthOfTextAtSize(text, size);
    this.page.drawText(text, { x: this.right - w, y: this.y, size, font, color: INK });
  }

  /** A section heading. Never left stranded at the foot of a page. */
  section(label: string) {
    this.ensure(52);
    this.y -= 10;
    this.page.drawText(label.toUpperCase(), {
      x: MARGIN, y: this.y, size: 9, font: this.bold, color: MUTED,
    });
    this.y -= 6;
    this.rule(0.4);
    this.y -= 14;
  }

  line(label: string, amount: number) {
    this.ensure(18);
    this.page.drawText(label.slice(0, 60), { x: MARGIN + 8, y: this.y, size: 10, font: this.body, color: INK });
    this.drawAmount(amount, 10, this.mono);
    this.y -= 16;
  }

  /** A totalled line: ruled above, bold, and double-ruled when it is the answer. */
  total(label: string, amount: number, emphatic = false) {
    this.ensure(30);
    this.y += 4;
    this.rule(emphatic ? 0.9 : 0.5);
    this.y -= 14;
    this.page.drawText(label, { x: MARGIN + 8, y: this.y, size: 10, font: this.bold, color: INK });
    this.drawAmount(amount, 10, emphatic ? this.bold : this.mono);
    this.y -= 6;
    if (emphatic) { this.rule(0.9); this.y -= 4; }
    this.y -= 10;
  }

  /** Free text: a note, a caveat, an explanation of why a figure is missing. */
  note(text: string) {
    this.ensure(28);
    this.page.drawText(text, {
      x: MARGIN, y: this.y, size: 8.5, font: this.body, color: MUTED,
      maxWidth: this.right - MARGIN, lineHeight: 11,
    });
    // One line per ~95 characters at this size and width.
    this.y -= 12 * Math.max(1, Math.ceil(text.length / 95)) + 6;
  }

  /** A three-column table, used for the asset register. */
  table(headers: [string, string, string, string], rows: [string, number, number, number][]) {
    this.ensure(40);
    const cols = [MARGIN + 8, this.right - 300, this.right - 165, this.right];
    this.page.drawText(headers[0], { x: cols[0], y: this.y, size: 8, font: this.bold, color: MUTED });
    for (let i = 1; i < 4; i++) {
      const w = this.bold.widthOfTextAtSize(headers[i], 8);
      this.page.drawText(headers[i], { x: cols[i] - w, y: this.y, size: 8, font: this.bold, color: MUTED });
    }
    this.y -= 6;
    this.rule(0.4);
    this.y -= 13;

    for (const [label, ...values] of rows) {
      this.ensure(16);
      this.page.drawText(label.slice(0, 42), { x: cols[0], y: this.y, size: 9, font: this.body, color: INK });
      values.forEach((v, i) => {
        const text = this.money(v);
        const w = this.mono.widthOfTextAtSize(text, 9);
        this.page.drawText(text, { x: cols[i + 1] - w, y: this.y, size: 9, font: this.mono, color: INK });
      });
      this.y -= 14;
    }
  }

  async save(): Promise<Uint8Array> {
    return this.doc.save();
  }
}
