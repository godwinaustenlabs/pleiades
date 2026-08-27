import { Env } from '../../index';

/**
 * The accountant's knowledge base: retrieval over compliance documents.
 *
 * The division of authority here is the important part, and it is deliberate:
 *
 *   compliance_config  →  the NUMBERS. Owned by the operator, effective-dated,
 *                         read deterministically by the calculators.
 *   this index         →  the PROSE. Rules, procedures, formats, worked
 *                         examples. Cited, never authoritative.
 *
 * A retrieved passage saying "the rate is 29%" is a *sentence*, and nothing in
 * it says which Finance Act it came from. A config row is a *fact with an
 * effective date* that someone owns. So a passage may explain that withholding
 * is deposited monthly; the deposit day still comes from configuration. Where
 * the two disagree the agent reports the disagreement rather than picking a
 * side — that is what the `authority` note on every result is for.
 *
 * Without that boundary the failure mode is an agent that sounds well-sourced
 * while quoting last year's law.
 */

/** Matches the index: @cf/baai/bge-base-en-v1.5 produces 768 dimensions. */
const EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5';

/** Namespaces keep the manual apart from the agent's own history. */
export type Namespace = 'compliance' | 'history';

export interface Passage {
  text: string;
  score: number;
  docId: string;
  title: string;
  section: string;
  namespace: string;
}

/**
 * Splits markdown into chunks that respect its structure.
 *
 * Heading-aware on purpose: a fixed-width split will cut a slab table or a
 * worked example in half, and half a rate table retrieved on its own is worse
 * than not retrieving it — it reads as complete. Each chunk carries the heading
 * path it came from so a citation can name the section.
 */
export function chunkMarkdown(
  markdown: string,
  opts: { maxChars?: number; overlapChars?: number } = {},
): { text: string; section: string }[] {
  const maxChars = opts.maxChars ?? 3200; // ≈800 tokens
  const overlap = opts.overlapChars ?? 320;

  const lines = markdown.split('\n');
  const out: { text: string; section: string }[] = [];
  const headings: string[] = [];
  let buf: string[] = [];

  const sectionPath = () => headings.filter(Boolean).join(' › ') || 'Document';

  const flush = () => {
    const text = buf.join('\n').trim();
    if (text) out.push({ text, section: sectionPath() });
    buf = [];
  };

  for (const line of lines) {
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      // A new heading closes the previous chunk: sections are the natural unit.
      flush();
      const level = heading[1].length;
      headings.length = level - 1;
      headings[level - 1] = heading[2].trim();
      buf.push(line);
      continue;
    }

    buf.push(line);

    if (buf.join('\n').length >= maxChars) {
      const text = buf.join('\n');
      out.push({ text: text.trim(), section: sectionPath() });
      // Carry a tail forward so a sentence spanning the boundary is still
      // retrievable from either side.
      const tail = text.slice(-overlap);
      buf = tail ? [tail] : [];
    }
  }
  flush();

  return out.filter((c) => c.text.replace(/[#\s]/g, '').length > 40);
}

/** Embeds text. Batched — Workers AI accepts an array and one call is cheaper. */
async function embed(env: Env, texts: string[]): Promise<number[][]> {
  const ai = env.AI as any;
  const out: number[][] = [];
  // Keep batches modest: a large body can exceed the model's request limits.
  for (let i = 0; i < texts.length; i += 25) {
    const batch = texts.slice(i, i + 25);
    const res = await ai.run(EMBEDDING_MODEL, { text: batch });
    out.push(...(res.data as number[][]));
  }
  return out;
}

export interface IngestResult {
  docId: string;
  chunks: number;
  characters: number;
}

/**
 * Converts a document in R2 into retrievable passages.
 *
 * PDF text extraction uses Workers AI's document conversion rather than a
 * bundled parser: it handles PDF, DOCX and friends, and it means a scanned file
 * fails loudly here instead of silently embedding an empty string — which would
 * leave a knowledge base that looks populated and returns nothing.
 */
export async function ingestDocument(
  env: Env,
  args: { r2Key: string; title: string; docId: string; namespace?: Namespace },
): Promise<IngestResult> {
  if (!env.VECTORIZE) throw new Error('No Vectorize index is bound.');
  if (!env.COMPLIANCE_BUCKET) throw new Error('No compliance bucket is bound.');

  const object = await env.COMPLIANCE_BUCKET.get(args.r2Key);
  if (!object) throw new Error(`No document at ${args.r2Key} in the compliance bucket.`);

  const bytes = await object.arrayBuffer();
  const namespace: Namespace = args.namespace ?? 'compliance';

  let markdown: string;
  const isPlainText = /\.(md|markdown|txt)$/i.test(args.r2Key);
  if (isPlainText) {
    markdown = new TextDecoder().decode(bytes);
  } else {
    const ai = env.AI as any;
    const converted = await ai.toMarkdown([
      { name: args.r2Key.split('/').pop() || args.r2Key, blob: new Blob([bytes]) },
    ]);
    markdown = Array.isArray(converted) ? converted[0]?.data ?? '' : (converted as any)?.data ?? '';
  }

  if (!markdown || markdown.replace(/\s/g, '').length < 200) {
    throw new Error(
      'That document produced almost no text. If it is a scan, it needs an OCR text layer ' +
        'before it can be indexed — an empty index looks populated and answers nothing.',
    );
  }

  const chunks = chunkMarkdown(markdown);
  if (chunks.length === 0) throw new Error('No usable passages found in that document.');

  const vectors = await embed(env, chunks.map((c) => c.text));

  // Re-ingesting replaces: without this, correcting a manual would leave the
  // old passages in place and the agent would cite both versions.
  await removeDocument(env, args.docId);

  const payload = chunks.map((c, i) => ({
    id: `${args.docId}#${i}`,
    values: vectors[i],
    metadata: {
      doc_id: args.docId,
      namespace,
      section: c.section,
      title: args.title,
      text: c.text.slice(0, 4000),
    },
  }));

  for (let i = 0; i < payload.length; i += 100) {
    await env.VECTORIZE.upsert(payload.slice(i, i + 100) as any);
  }

  return { docId: args.docId, chunks: chunks.length, characters: markdown.length };
}

/** Drops every passage belonging to a document. */
export async function removeDocument(env: Env, docId: string, maxChunks = 2000): Promise<void> {
  if (!env.VECTORIZE) return;
  const ids = Array.from({ length: maxChunks }, (_, i) => `${docId}#${i}`);
  for (let i = 0; i < ids.length; i += 500) {
    try {
      await env.VECTORIZE.deleteByIds(ids.slice(i, i + 500));
    } catch {
      // Deleting ids that were never created is not an error worth failing on.
    }
  }
}

/**
 * Semantic search over the indexed documents.
 *
 * Returns passages *with their source and section*, so every citation the agent
 * makes can be checked against the document it came from.
 */
export async function searchKnowledge(
  env: Env,
  query: string,
  opts: { topK?: number; namespace?: Namespace } = {},
): Promise<{ passages: Passage[]; note: string }> {
  if (!env.VECTORIZE) {
    return {
      passages: [],
      note: 'No knowledge base is configured. Answer from the compliance settings alone, and say that no reference document is available.',
    };
  }

  const [vector] = await embed(env, [query]);
  const result = await env.VECTORIZE.query(vector, {
    topK: Math.min(opts.topK ?? 5, 20),
    returnMetadata: 'all',
    ...(opts.namespace ? { filter: { namespace: opts.namespace } } : {}),
  } as any);

  const passages: Passage[] = (result.matches || []).map((m: any) => ({
    text: String(m.metadata?.text ?? ''),
    score: m.score,
    docId: String(m.metadata?.doc_id ?? ''),
    title: String(m.metadata?.title ?? 'Untitled'),
    section: String(m.metadata?.section ?? ''),
    // Not defaulted to 'compliance'. Every writer sets this, but a vector that
    // somehow lacks it must not be promoted to the more authoritative of the
    // two kinds just because the field is missing.
    namespace: String(m.metadata?.namespace ?? 'unlabelled'),
  }));

  return {
    passages,
    // The note travels with the results rather than sitting in the system
    // prompt: it is read at the moment the passages are, which is the moment
    // the mistake it guards against would be made.
    note:
      passages.length === 0
        ? 'Nothing indexed matched. Say so rather than answering from memory.'
        : 'These passages explain rules and procedure, or record what you did before. Check the ' +
          '`kind` on each: "reference" is the manual and may be cited; "own-note" is something you ' +
          'wrote yourself and is evidence of what happened, never authority for what is correct; ' +
          '"unlabelled" has no known origin and should not be relied on at all. ' +
          'None of them is the source of any rate — every number comes from the compliance settings. If ' +
          'a passage states a figure that contradicts the configured value, report the discrepancy ' +
          '— do not choose between them.',
  };
}
