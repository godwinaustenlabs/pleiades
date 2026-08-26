import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { getDb, schema } from '@ganova/database';
import { Env } from '../../index';
import { generateId } from '../../utils/id';

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
