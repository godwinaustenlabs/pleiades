import { and, desc, eq, gte, inArray, isNotNull, lt, lte } from 'drizzle-orm';
import { getDb, schema } from '@pleiades/database';
import { Env } from '../../index';
import { generateId } from '../../utils/id';
import { chunk } from '../../utils/batch';

/**
 * The agent's working memory of its own actions.
 *
 * Every entry is written to D1 first and embedded into Vectorize second, under
 * the `history` namespace so it can never be confused with the compliance
 * manual. The split is deliberate:
 *
 *   D1         exact, ordered, filterable. "What did you file in August, and
 *              why was it nil?" — an auditor will not accept a similarity score.
 *   Vectorize  associative. "Have I dealt with something like this before?"
 *
 * If embedding fails the row still stands. A journal that silently drops
 * entries is worse than no journal, because it looks complete.
 */

const EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5';

export interface JournalEntry {
  actionType: string;
  subject: string;
  summary: string;
  rationale?: string;
  entities?: Record<string, unknown>;
  periodLabel?: string;
  outcome?: 'completed' | 'refused' | 'blocked';
  actorUserId: string;
  conversationId?: string;
  source?: 'agent' | 'approval_gate';
  occurredAt?: Date;
}

/**
 * The text that gets embedded.
 *
 * Composed rather than embedding the summary alone: a later question like "why
 * was the August sales return nil" has to match on the period and the reason,
 * not just on the word "return".
 */
function embeddableText(e: JournalEntry): string {
  return [
    `${e.actionType}: ${e.subject}`,
    e.periodLabel ? `Period: ${e.periodLabel}` : '',
    e.summary,
    e.rationale ? `Why: ${e.rationale}` : '',
    e.outcome && e.outcome !== 'completed' ? `Outcome: ${e.outcome}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Records an action. Never throws — a failed journal write must not fail the action it describes. */
export async function recordAction(env: Env, entry: JournalEntry): Promise<{ id: string; embedded: boolean }> {
  const db = getDb(env);
  const id = generateId('jnl');
  const occurredAt = entry.occurredAt ?? new Date();
  const now = new Date();

  await db.insert(schema.agentJournal).values({
    id,
    actionType: entry.actionType,
    subject: entry.subject,
    summary: entry.summary,
    rationale: entry.rationale ?? null,
    entities: entry.entities ? JSON.stringify(entry.entities) : null,
    periodLabel: entry.periodLabel ?? null,
    outcome: entry.outcome ?? 'completed',
    actorUserId: entry.actorUserId,
    conversationId: entry.conversationId ?? null,
    source: entry.source ?? 'agent',
    occurredAt,
    createdAt: now,
  });

  let embedded = false;
  try {
    if (env.VECTORIZE) {
      const ai = env.AI as any;
      const res = await ai.run(EMBEDDING_MODEL, { text: [embeddableText(entry)] });
      await env.VECTORIZE.upsert([
        {
          id: `journal:${id}`,
          values: res.data[0],
          metadata: {
            namespace: 'history',
            doc_id: id,
            section: entry.actionType,
            title: entry.subject,
            text: embeddableText(entry).slice(0, 4000),
            occurred_at: occurredAt.toISOString(),
            period: entry.periodLabel ?? '',
          },
        },
      ] as any);
      await db
        .update(schema.agentJournal)
        .set({ vectorId: `journal:${id}` })
        .where(eq(schema.agentJournal.id, id));
      embedded = true;
    }
  } catch (err) {
    // Deliberately swallowed: the record exists in D1, which is the part that
    // matters for accountability. Losing recall is a degradation; losing the
    // record would be a hole in the audit trail.
    console.error('[journal] embedding failed, record kept:', err);
  }

  return { id, embedded };
}

export interface RecalledEntry {
  id: string;
  actionType: string;
  subject: string;
  summary: string;
  rationale: string | null;
  periodLabel: string | null;
  outcome: string;
  occurredAt: string;
  source: string;
  /** The records this action touched: ids, periods, amounts. */
  entities: Record<string, unknown> | null;
  relevance?: number;
}

/**
 * Recalls past actions.
 *
 * Semantic when a query is given, chronological otherwise — and the exact
 * filters win. Asking "what did I do in 2026-08" should return August, not
 * whatever is most similar to the word August.
 */
export async function recallActions(
  env: Env,
  opts: {
    query?: string;
    actionType?: string;
    periodLabel?: string;
    since?: Date;
    until?: Date;
    limit?: number;
  } = {},
): Promise<{ entries: RecalledEntry[]; mode: 'semantic' | 'chronological' }> {
  const db = getDb(env);
  const limit = Math.min(opts.limit ?? 10, 50);

  const toEntry = (r: any, relevance?: number): RecalledEntry => ({
    id: r.id,
    actionType: r.actionType,
    subject: r.subject,
    summary: r.summary,
    rationale: r.rationale,
    periodLabel: r.periodLabel,
    outcome: r.outcome,
    occurredAt: new Date(r.occurredAt).toISOString(),
    source: r.source,
    // Returned, not just stored. Without it the agent could recall that it had
    // filed something but not which record it filed, which is exactly the
    // question that gets asked next.
    entities: (() => {
      if (!r.entities) return null;
      try { return JSON.parse(r.entities); } catch { return null; }
    })(),
    ...(relevance !== undefined ? { relevance } : {}),
  });

  // An exact filter is an exact question; do not answer it with similarity.
  const hasFilters = !!(opts.actionType || opts.periodLabel || opts.since || opts.until);

  if (opts.query && !hasFilters && env.VECTORIZE) {
    const ai = env.AI as any;
    const res = await ai.run(EMBEDDING_MODEL, { text: [opts.query] });
    const hits = await env.VECTORIZE.query(res.data[0], {
      topK: limit,
      returnMetadata: 'all',
      filter: { namespace: 'history' },
    } as any);

    const ids = (hits.matches || []).map((m: any) => String(m.metadata?.doc_id ?? ''));
    const scores = new Map(
      (hits.matches || []).map((m: any) => [String(m.metadata?.doc_id ?? ''), m.score as number]),
    );
    if (ids.length === 0) return { entries: [], mode: 'semantic' };

    // Read the rows rather than trusting metadata: the row is the record, and
    // metadata is a copy that can lag it. Fetched by id — this used to read the
    // entire journal on every semantic recall and throw nearly all of it away,
    // which got slower with every action the agent ever took.
    const rows = await db
      .select()
      .from(schema.agentJournal)
      .where(inArray(schema.agentJournal.id, ids));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const entries = ids
      .filter((id: string) => byId.has(id))
      .map((id: string) => toEntry(byId.get(id), scores.get(id)));
    return { entries, mode: 'semantic' };
  }

  const conditions = [
    opts.actionType ? eq(schema.agentJournal.actionType, opts.actionType) : undefined,
    opts.periodLabel ? eq(schema.agentJournal.periodLabel, opts.periodLabel) : undefined,
    opts.since ? gte(schema.agentJournal.occurredAt, opts.since) : undefined,
    opts.until ? lte(schema.agentJournal.occurredAt, opts.until) : undefined,
  ].filter(Boolean) as any[];

  const rows = await db
    .select()
    .from(schema.agentJournal)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(schema.agentJournal.occurredAt))
    .limit(limit);

  return { entries: rows.map((r) => toEntry(r)), mode: 'chronological' };
}

/**
 * Drops journal vectors older than a year out of the index.
 *
 * The **row stays**. `agent_journal` is the accountable record of what the
 * agent did and why, and a company's books are not something to forget after
 * twelve months — dated recall (`recall_actions` with `since`/`until`) still
 * reaches every entry ever written. What is bounded is the *semantic* index:
 * Vectorize is billed per stored vector and, more to the point, similarity
 * search over years of routine bookkeeping surfaces the merely-similar ahead of
 * the recent and relevant.
 *
 * A year because that is the shape of the work: the tax year, the annual
 * return, "what did we do last time this came round". Two Januaries ago is
 * history to be looked up by date, not a neighbour to be stumbled upon.
 */
export async function pruneJournalVectors(
  env: Env,
  opts: { olderThanDays?: number; now?: Date } = {},
): Promise<{ pruned: number; cutoff: string }> {
  const days = opts.olderThanDays ?? 365;
  const cutoff = new Date((opts.now ?? new Date()).getTime() - days * 24 * 60 * 60 * 1000);

  // Without the binding there is nothing to prune *from*. Clearing `vector_id`
  // anyway would drop the only pointer to vectors that are still in the index,
  // leaving them there permanently with nothing that remembers they exist.
  if (!env.VECTORIZE) return { pruned: 0, cutoff: cutoff.toISOString() };

  const db = getDb(env);
  const stale = await db
    .select({ id: schema.agentJournal.id, vectorId: schema.agentJournal.vectorId })
    .from(schema.agentJournal)
    .where(and(lt(schema.agentJournal.occurredAt, cutoff), isNotNull(schema.agentJournal.vectorId)));

  if (stale.length === 0) return { pruned: 0, cutoff: cutoff.toISOString() };

  let pruned = 0;
  for (const batch of chunk(stale, 100)) {
    const vectorIds = batch.map((r) => r.vectorId!).filter(Boolean);
    try {
      if (vectorIds.length) await env.VECTORIZE.deleteByIds(vectorIds);
      // Cleared only after the delete succeeds, so a failed batch is retried on
      // the next sweep rather than leaving a vector in the index that nothing
      // remembers is there.
      await db
        .update(schema.agentJournal)
        .set({ vectorId: null })
        .where(inArray(schema.agentJournal.id, batch.map((r) => r.id)));
      pruned += vectorIds.length;
    } catch (err) {
      console.error('[journal] pruning a batch failed, leaving it for next time:', err);
    }
  }

  return { pruned, cutoff: cutoff.toISOString() };
}
