import { Hono } from 'hono';
import { desc } from 'drizzle-orm';
import { getDb, schema } from '@ganova/database';
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

statementsRouter.get('/', requireFeatureAccess('finance', 'docs', 'view'), async (c) => {
  try {
    const rows = await getDb(c.env)
      .select()
      .from(schema.generatedDocuments)
      .orderBy(desc(schema.generatedDocuments.createdAt))
      .limit(100);
    return ok(
      c,
      rows.map((r) => ({
        ...r,
        // Parsed here so the UI can show what the figures were without
        // re-reading the ledger, and without every page parsing JSON itself.
        generationBasis: r.generationBasis ? JSON.parse(r.generationBasis) : null,
      })),
    );
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
