import { Hono } from 'hono';
import { desc } from 'drizzle-orm';
import { getDb, schema } from '@pleiades/database';
import { Env } from '../index';
import { requireFeatureAccess } from '../middleware/rbac';
import { logAudit } from '../utils/audit';
import { ok, badRequest, serverError } from '../utils/response';
import { generateStatement, type StatementType } from '../statements/render';

/**
 * Generated statements, under `/api/finance/statements`.
 *
 * Gated on `finance/docs` rather than on a new feature: a statement is a
 * document produced from the ledger, and it lands in the same Documents tab
 * behind the same grant. Someone who may read the finance documents may produce
 * one; the figures come from journals they can already see.
 */
const statementsRouter = new Hono<{ Bindings: Env }>();

const TYPES: StatementType[] = ['profit_and_loss', 'assets_and_liabilities'];
const isDate = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** The R2 key a recorded `file_url` points at. */
function keyFromFileUrl(fileUrl: string): string | null {
  const marker = '/download/';
  const at = fileUrl.indexOf(marker);
  if (at === -1) return null;
  try {
    return decodeURIComponent(fileUrl.slice(at + marker.length));
  } catch {
    return fileUrl.slice(at + marker.length);
  }
}

/**
 * Which of these keys actually exist in the bucket.
 *
 * One `list` over the statements prefix rather than a `head` per row: the page
 * shows up to a hundred, and a hundred round trips to answer one question is a
 * hundred round trips. Anything recorded outside that prefix — nothing today —
 * falls back to an individual `head` rather than being assumed missing.
 */
async function presentKeys(bucket: R2Bucket, wanted: string[]): Promise<Set<string>> {
  const PREFIX = 'finance-docs/statements/';
  const present = new Set<string>();

  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix: PREFIX, cursor });
    for (const obj of page.objects) present.add(obj.key);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  const strays = wanted.filter((k) => !k.startsWith(PREFIX));
  await Promise.all(
    strays.map(async (k) => {
      if (await bucket.head(k)) present.add(k);
    }),
  );

  return present;
}

statementsRouter.get('/', requireFeatureAccess('finance', 'docs', 'view'), async (c) => {
  try {
    const rows = await getDb(c.env)
      .select()
      .from(schema.generatedDocuments)
      .orderBy(desc(schema.generatedDocuments.createdAt))
      .limit(100);

    const shaped = rows.map((r) => ({
      ...r,
      // Parsed here so the UI can show what the figures were without
      // re-reading the ledger, and without every page parsing JSON itself.
      generationBasis: r.generationBasis ? JSON.parse(r.generationBasis) : null,
      r2Key: keyFromFileUrl(r.fileUrl),
    }));

    // The bucket is the authority on what can be downloaded. A row whose file
    // has been removed described a document that no longer exists, and offering
    // it produced a Download button that could only ever fail.
    //
    // The row is kept. `generated_documents` records that a statement was
    // produced, on what date and from which figures; deleting the file does not
    // unmake that, and an audit trail that quietly erases itself when a bucket
    // is tidied is not an audit trail. It is filtered from the list, not the
    // database — and nothing here deletes anything.
    if (!c.env.CRM_BUCKET) {
      return ok(c, { statements: shaped, missing: 0 });
    }

    const present = await presentKeys(
      c.env.CRM_BUCKET,
      shaped.map((r) => r.r2Key).filter((k): k is string => !!k),
    );
    const available = shaped.filter((r) => r.r2Key && present.has(r.r2Key));

    return ok(c, {
      statements: available,
      // Named rather than silently dropped, so "never generated" and "generated
      // and since removed" do not look identical to whoever is reading.
      missing: shaped.length - available.length,
    });
  } catch (err) { return serverError(c, err); }
});

statementsRouter.post('/', requireFeatureAccess('finance', 'docs', 'edit'), async (c) => {
  try {
    const user = c.get('user' as any);
    const body = await c.req.json().catch(() => ({}));

    if (!TYPES.includes(body.type)) {
      return badRequest(c, `type must be one of: ${TYPES.join(', ')}`);
    }
    if (!isDate(body.endDate)) return badRequest(c, 'endDate must be YYYY-MM-DD.');
    if (body.type === 'profit_and_loss' && !isDate(body.startDate)) {
      // Refused rather than defaulted: a profit and loss account over a period
      // nobody chose is a figure that looks authoritative and answers a
      // question that was never asked.
      return badRequest(c, 'startDate (YYYY-MM-DD) is required for a profit and loss account.');
    }

    const result = await generateStatement(c.env, {
      type: body.type,
      startDate: body.startDate,
      endDate: body.endDate,
      actorUserId: user.id,
      requestedVia: `requested by ${user.name || user.email || user.id}`,
    });
    if ('error' in result) return badRequest(c, result.error);

    await logAudit(c.env, user.id, 'CREATE', 'generated_documents', result.docId, {
      type: body.type,
      periodLabel: result.periodLabel,
      version: result.version,
    });
    return ok(c, result);
  } catch (err) { return serverError(c, err); }
});

export default statementsRouter;
