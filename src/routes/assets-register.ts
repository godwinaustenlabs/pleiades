import { Hono } from 'hono';
import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { getDb, schema } from '@pleiades/database';
import { Env } from '../index';
import { requireFeatureAccess } from '../middleware/rbac';
import { generateId } from '../utils/id';
import { logAudit } from '../utils/audit';
import { ok, created, notFound, badRequest, serverError } from '../utils/response';
import {
  chargeForPeriod,
  depreciationAsOf,
  isDepreciable,
  monthlyCharge,
  type DepreciableAsset,
} from '../utils/depreciation';

/**
 * The asset register, under `/api/finance/assets`.
 *
 * Deliberately not in `src/routes/assets.ts`: that router is R2 blob storage
 * for uploaded files, mounted at `/api/assets` with wildcard key routes that a
 * record API would shadow. Same word, different thing.
 *
 * HR keeps its `/api/hr/assets` routes for custody — who holds what — and both
 * read the same table. Money is gated here, behind `finance/assets`, because
 * knowing a laptop is assigned to someone is not the same trust as knowing what
 * the company paid for it.
 */
const assetRegisterRouter = new Hono<{ Bindings: Env }>();

/** Defaults by class, in months. Overridden per asset whenever one is given. */
const DEFAULT_LIFE: Record<string, number> = {
  laptop: 36,
  equipment: 60,
  furniture: 120,
  vehicle: 60,
  building: 360,
  stationery: 0, // expensed, never capitalised
  other: 60,
};

const ASSET_CLASSES = Object.keys(DEFAULT_LIFE);

/** Strips what a client may not set, and coerces the money columns to numbers. */
function sanitise(body: Record<string, any>) {
  const b = { ...body };
  // The HR route lets a PATCH rewrite the primary key. Not here.
  delete b.id;
  delete b.createdAt;
  delete b.updatedAt;
  // Accumulated depreciation is a consequence of posting, never an input;
  // letting a caller set it directly would put the register out of step with
  // the ledger with no journal to explain the difference.
  delete b.accumulatedDepreciation;
  delete b.lastDepreciationPeriod;

  for (const k of ['purchaseCost', 'salvageValue', 'disposalProceeds']) {
    if (b[k] !== undefined && b[k] !== null && b[k] !== '') b[k] = Number(b[k]);
    else if (b[k] === '') b[k] = null;
  }
  if (b.usefulLifeMonths !== undefined && b.usefulLifeMonths !== null && b.usefulLifeMonths !== '') {
    b.usefulLifeMonths = Math.round(Number(b.usefulLifeMonths));
  }
  return b;
}

function validate(b: Record<string, any>): string | null {
  if (b.assetClass && !ASSET_CLASSES.includes(b.assetClass)) {
    return `assetClass must be one of: ${ASSET_CLASSES.join(', ')}`;
  }
  for (const [k, label] of [
    ['purchaseCost', 'purchaseCost'],
    ['salvageValue', 'salvageValue'],
    ['disposalProceeds', 'disposalProceeds'],
  ] as const) {
    if (b[k] !== undefined && b[k] !== null && (!Number.isFinite(b[k]) || b[k] < 0)) {
      return `${label} must be a number of zero or more.`;
    }
  }
  if (b.usefulLifeMonths != null && (!Number.isFinite(b.usefulLifeMonths) || b.usefulLifeMonths < 0)) {
    return 'usefulLifeMonths must be a whole number of months.';
  }
  if (
    b.purchaseCost != null &&
    b.salvageValue != null &&
    b.salvageValue > b.purchaseCost
  ) {
    return 'salvageValue cannot exceed purchaseCost.';
  }
  for (const k of ['purchaseDate', 'disposedAt'] as const) {
    if (b[k] && !/^\d{4}-\d{2}-\d{2}$/.test(b[k])) return `${k} must be YYYY-MM-DD.`;
  }
  return null;
}

/** The row plus its computed position, so the UI never re-derives the figures. */
function withValuation(row: any, asOf: string) {
  const state = depreciationAsOf(row as DepreciableAsset, asOf);
  return {
    ...row,
    monthlyDepreciation: monthlyCharge(row as DepreciableAsset),
    depreciable: isDepreciable(row as DepreciableAsset),
    // What is actually on the books, from the posted figure — distinct from
    // `accumulatedToDate`, which is what *should* have been posted by now. A
    // gap between the two is un-posted depreciation, and saying so is the point.
    accumulatedPosted: row.accumulatedDepreciation ?? 0,
    accumulatedToDate: state.accumulated,
    unpostedDepreciation: Math.max(0, state.accumulated - (row.accumulatedDepreciation ?? 0)),
    writtenDownValue: Math.round(((row.purchaseCost ?? 0) - (row.accumulatedDepreciation ?? 0)) * 100) / 100,
    fullyDepreciated: state.fullyDepreciated,
    disposed: state.disposed,
  };
}

const today = () => new Date().toISOString().slice(0, 10);

assetRegisterRouter.get('/', requireFeatureAccess('finance', 'assets', 'view'), async (c) => {
  try {
    const db = getDb(c.env);
    const asOf = c.req.query('asOf') || today();
    const cls = c.req.query('assetClass');
    const status = c.req.query('status');
    const assignedTo = c.req.query('assignedTo');
    const includeDisposed = c.req.query('includeDisposed') === 'true';

    const conditions = [
      cls ? eq(schema.assets.assetClass, cls) : undefined,
      status ? eq(schema.assets.status, status) : undefined,
      assignedTo ? eq(schema.assets.assignedTo, assignedTo) : undefined,
      includeDisposed ? undefined : isNull(schema.assets.disposedAt),
    ].filter(Boolean) as any[];

    const rows = await db
      .select()
      .from(schema.assets)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(schema.assets.createdAt));

    const valued = rows.map((r) => withValuation(r, asOf));
    return ok(c, {
      asOf,
      assets: valued,
      totals: {
        count: valued.length,
        cost: round(valued.reduce((s, a) => s + (a.purchaseCost ?? 0), 0)),
        accumulatedDepreciation: round(valued.reduce((s, a) => s + a.accumulatedPosted, 0)),
        writtenDownValue: round(valued.reduce((s, a) => s + a.writtenDownValue, 0)),
        unposted: round(valued.reduce((s, a) => s + a.unpostedDepreciation, 0)),
      },
    });
  } catch (err) { return serverError(c, err); }
});

const round = (n: number) => Math.round(n * 100) / 100;

assetRegisterRouter.get('/classes', requireFeatureAccess('finance', 'assets', 'view'), async (c) =>
  ok(c, ASSET_CLASSES.map((key) => ({ key, defaultLifeMonths: DEFAULT_LIFE[key] }))),
);

/**
 * What a monthly run would charge, per asset, without posting anything.
 *
 * Separate from the posting tool on purpose: an accountant should be able to
 * see the schedule before authorising the journal that acts on it.
 */
assetRegisterRouter.get('/depreciation', requireFeatureAccess('finance', 'assets', 'view'), async (c) => {
  try {
    const period = c.req.query('period') || new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(period)) return badRequest(c, 'period must be YYYY-MM.');

    const rows = await getDb(c.env).select().from(schema.assets).where(isNull(schema.assets.disposedAt));
    const lines = rows
      .map((r) => ({
        assetId: r.id,
        assetName: r.assetName,
        assetClass: r.assetClass,
        monthlyCharge: monthlyCharge(r as DepreciableAsset),
        charge: chargeForPeriod(r as any, period),
        lastPosted: r.lastDepreciationPeriod,
        expenseAccountId: r.depreciationExpenseAccountId,
        accumulatedAccountId: r.accumulatedDepreciationAccountId,
        // Named rather than silently skipped: "nothing to post" and "cannot
        // post because nobody wired the accounts" look identical otherwise.
        blocked: !r.depreciationExpenseAccountId || !r.accumulatedDepreciationAccountId
          ? 'no depreciation accounts set'
          : null,
      }))
      .filter((l) => l.charge > 0);

    return ok(c, {
      period,
      lines,
      total: round(lines.reduce((s, l) => s + l.charge, 0)),
      postable: round(lines.filter((l) => !l.blocked).reduce((s, l) => s + l.charge, 0)),
    });
  } catch (err) { return serverError(c, err); }
});

/**
 * Posts one month of depreciation to the general journal.
 *
 * One compound entry for the whole register rather than one per asset: it is a
 * single monthly accounting event, and thirty journal rows for thirty laptops
 * would bury the month's real transactions.
 *
 * Debit depreciation expense, credit accumulated depreciation — the asset's own
 * cost account is never touched, which is what makes accumulated depreciation a
 * contra-asset and lets the statement show cost and written-down value side by
 * side. Every line names the two accounts configured on the asset, so an asset
 * with no accounts set is reported as skipped rather than posted to a default
 * that would be wrong for something.
 *
 * The register is only advanced for assets that made it into the entry, so a
 * partial run leaves the rest still owing rather than marking them paid.
 */
assetRegisterRouter.post(
  '/post-depreciation',
  requireFeatureAccess('finance', 'assets', 'edit'),
  async (c) => {
    try {
      const db = getDb(c.env);
      const user = c.get('user' as any);
      const body = await c.req.json().catch(() => ({}));
      const period: string = body.period || new Date().toISOString().slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(period)) return badRequest(c, 'period must be YYYY-MM.');

      const rows = await db.select().from(schema.assets).where(isNull(schema.assets.disposedAt));

      const posting: { asset: any; charge: number }[] = [];
      const skipped: { assetId: string; assetName: string; reason: string }[] = [];

      for (const r of rows) {
        const charge = chargeForPeriod(r as any, period);
        if (charge <= 0) continue;
        if (!r.depreciationExpenseAccountId || !r.accumulatedDepreciationAccountId) {
          skipped.push({
            assetId: r.id,
            assetName: r.assetName,
            reason: 'No depreciation accounts set on this asset.',
          });
          continue;
        }
        posting.push({ asset: r, charge });
      }

      if (posting.length === 0) {
        // Not an error: a month with nothing to charge is a normal month.
        return ok(c, { period, posted: false, total: 0, assets: 0, skipped, journalId: null });
      }

      // Debits per expense account, credits per accumulated account. Grouped so
      // the entry reads as accounting rather than as a list of assets.
      const debits = new Map<string, number>();
      const credits = new Map<string, number>();
      for (const { asset, charge } of posting) {
        debits.set(asset.depreciationExpenseAccountId, round((debits.get(asset.depreciationExpenseAccountId) ?? 0) + charge));
        credits.set(asset.accumulatedDepreciationAccountId, round((credits.get(asset.accumulatedDepreciationAccountId) ?? 0) + charge));
      }

      const lines = [
        ...[...debits].map(([accountId, amount]) => ({ accountId, type: 'debit', amount })),
        ...[...credits].map(([accountId, amount]) => ({ accountId, type: 'credit', amount })),
      ];
      const total = round(posting.reduce((s, p) => s + p.charge, 0));

      const drTotal = round(lines.filter((l) => l.type === 'debit').reduce((s, l) => s + l.amount, 0));
      const crTotal = round(lines.filter((l) => l.type === 'credit').reduce((s, l) => s + l.amount, 0));
      if (Math.abs(drTotal - crTotal) > 0.01) {
        // Cannot happen from the grouping above, and is checked anyway: an
        // unbalanced entry is the one thing that must never reach the ledger.
        return badRequest(c, 'Refusing to post: the entry does not balance.');
      }

      const journalId = generateId('jrn');
      await db.insert(schema.generalJournals).values({
        id: journalId,
        entryDate: `${period}-01`,
        description: `Depreciation for ${period} (${posting.length} asset${posting.length === 1 ? '' : 's'})`,
        amount: total,
        lines: JSON.stringify(lines),
        createdAt: new Date(),
      });

      for (const { asset, charge } of posting) {
        await db
          .update(schema.assets)
          .set({
            accumulatedDepreciation: round((asset.accumulatedDepreciation ?? 0) + charge),
            lastDepreciationPeriod: period,
            updatedAt: new Date(),
          })
          .where(eq(schema.assets.id, asset.id));
      }

      await logAudit(c.env, user.id, 'CREATE', 'general_journals', journalId, {
        action: 'post_depreciation',
        period,
        total,
        assets: posting.length,
      });

      return ok(c, {
        period,
        posted: true,
        journalId,
        total,
        assets: posting.length,
        skipped,
      });
    } catch (err) { return serverError(c, err); }
  },
);

assetRegisterRouter.get('/:id', requireFeatureAccess('finance', 'assets', 'view'), async (c) => {
  try {
    const row = await getDb(c.env).query.assets.findFirst({
      where: eq(schema.assets.id, c.req.param('id')),
    });
    if (!row) return notFound(c);
    return ok(c, withValuation(row, c.req.query('asOf') || today()));
  } catch (err) { return serverError(c, err); }
});

assetRegisterRouter.post('/', requireFeatureAccess('finance', 'assets', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user' as any);
    const body = sanitise(await c.req.json());
    if (!body.assetName) return badRequest(c, 'assetName is required.');
    const invalid = validate(body);
    if (invalid) return badRequest(c, invalid);

    const assetClass = body.assetClass || 'other';
    const id = generateId('ast');
    await db.insert(schema.assets).values({
      ...body,
      id,
      assetName: String(body.assetName),
      assetClass,
      // The class supplies a life when nobody states one, so an asset entered in
      // a hurry still depreciates instead of sitting at cost forever.
      usefulLifeMonths: body.usefulLifeMonths ?? DEFAULT_LIFE[assetClass] ?? null,
      assetType: body.assetType || assetClass,
      status: body.status || 'Available',
      accumulatedDepreciation: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await logAudit(c.env, user.id, 'CREATE', 'assets', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});

assetRegisterRouter.patch('/:id', requireFeatureAccess('finance', 'assets', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user' as any);
    const id = c.req.param('id');
    const body = sanitise(await c.req.json());
    const invalid = validate(body);
    if (invalid) return badRequest(c, invalid);

    const existing = await db.query.assets.findFirst({ where: eq(schema.assets.id, id) });
    if (!existing) return notFound(c);

    await db
      .update(schema.assets)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(schema.assets.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'assets', id, body);
    return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});

/**
 * Disposal, as its own route rather than a PATCH.
 *
 * Retiring an asset stops its depreciation and takes it off the statement; that
 * is a different act from correcting a serial number, and the audit trail
 * should be able to tell them apart.
 */
assetRegisterRouter.post('/:id/dispose', requireFeatureAccess('finance', 'assets', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user' as any);
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const disposedAt = body.disposedAt || today();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(disposedAt)) return badRequest(c, 'disposedAt must be YYYY-MM-DD.');

    const existing = await db.query.assets.findFirst({ where: eq(schema.assets.id, id) });
    if (!existing) return notFound(c);
    if (existing.disposedAt) return badRequest(c, 'Already disposed.');

    await db
      .update(schema.assets)
      .set({
        disposedAt,
        disposalProceeds: body.proceeds != null ? Number(body.proceeds) : null,
        status: 'Disposed',
        notes: body.reason ? `${existing.notes ? `${existing.notes}\n` : ''}Disposed: ${body.reason}` : existing.notes,
        updatedAt: new Date(),
      })
      .where(eq(schema.assets.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'assets', id, { disposedAt, proceeds: body.proceeds });
    return ok(c, { id, disposedAt });
  } catch (err) { return serverError(c, err); }
});

/**
 * Deletion, for a row entered in error.
 *
 * Refused once the asset has been depreciated: those charges are in the ledger,
 * and removing the thing they refer to would leave journal entries pointing at
 * nothing. Dispose of it instead — that is what disposal is for.
 */
assetRegisterRouter.delete('/:id', requireFeatureAccess('finance', 'assets', 'delete'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user' as any);
    const id = c.req.param('id');
    const existing = await db.query.assets.findFirst({ where: eq(schema.assets.id, id) });
    if (!existing) return notFound(c);
    if ((existing.accumulatedDepreciation ?? 0) > 0 || existing.lastDepreciationPeriod) {
      return badRequest(
        c,
        'This asset has depreciation posted to the ledger and cannot be deleted. Dispose of it instead.',
      );
    }
    await db.delete(schema.assets).where(eq(schema.assets.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'assets', id, { assetName: existing.assetName });
    return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});

export default assetRegisterRouter;
export { DEFAULT_LIFE, ASSET_CLASSES };
