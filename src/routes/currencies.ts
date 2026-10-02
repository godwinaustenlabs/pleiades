import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@pleiades/database';
import { Env } from '../index';
import { authMiddleware, UserPayload } from '../middleware/auth';
import { requireFeatureAccess } from '../middleware/rbac';
import { generateId } from '../utils/id';
import { logAudit } from '../utils/audit';
import { ok, created, notFound, badRequest, serverError } from '../utils/response';

/**
 * The currency catalogue: which currencies the company uses, and which one is its own.
 *
 * Top level, at `/api/currencies`, with the READ open to any authenticated caller and
 * every WRITE gated on `finance/accounts`. It used to live inside `finance.ts`, behind
 * `requireAppAccess('finance')`, and that is the whole reason this file exists:
 *
 * `accounts.currency` has always been stored and the UI has always ignored it. Every
 * amount in the app rendered a hardcoded `$` — on a database whose accounts are all
 * PKR — and the fix could not simply be "look the symbol up", because a payslip is an
 * HR screen, a deal is an Acquisition screen, and neither can reach `/api/finance/*`.
 * A list of ISO codes and symbols is not finance data; it is less sensitive than the
 * staff directory, and it appears on every invoice the company sends.
 *
 * Writing is different, and stays where it was: adding, retiring or re-denominating
 * what the company trades in is an accounting decision.
 */
const currenciesRouter = new Hono<{ Bindings: Env; Variables: { user: UserPayload } }>();
currenciesRouter.use('*', authMiddleware);

/** Normalise a submitted code: ISO 4217 is three upper-case letters. */
function normaliseCurrencyCode(raw: unknown): string | null {
  const code = String(raw ?? '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

/**
 * Readable by anyone signed in. See the note at the top of this file: gating this on
 * `finance/accounts` is what left every HR and Acquisition screen with no way to find
 * out what a currency's symbol was, so they all printed `$`.
 */
currenciesRouter.get('/', async (c) => {
  try {
    const db = getDb(c.env);
    const rows = await db.query.currencies.findMany();
    // Active first, then alphabetical — the dropdown reads in this order.
    rows.sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.code.localeCompare(b.code));
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});

/**
 * PUT /currencies/base — which currency the company's own money is in.
 *
 * It is what every amount that names no currency is displayed in: a transaction, an
 * invoice, a payslip, a line in the asset register. One row holds it, enforced by a
 * partial unique index, so this clears the old one in the same breath as setting the
 * new — two bases is a state where which symbol you get depends on row order.
 *
 * Changing it re-labels historical figures without converting them, which is almost
 * never what somebody wants after the first week. Hence `finance/accounts` edit, and
 * hence the previous value in the audit entry.
 */
currenciesRouter.put('/base', requireFeatureAccess('finance', 'accounts', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user');
    const { code } = await c.req.json<{ code?: string }>();
    const wanted = normaliseCurrencyCode(code);
    if (!wanted) return badRequest(c, 'code must be a three-letter currency code, e.g. PKR');

    const row = await db.query.currencies.findFirst({ where: eq(schema.currencies.code, wanted) });
    if (!row) return notFound(c, `${wanted} is not in the catalogue. Add it first.`);
    if (!row.isActive) return badRequest(c, `${wanted} is retired. Reactivate it before making it the base currency.`);

    const previous = await db.query.currencies.findFirst({ where: eq(schema.currencies.isBase, true) });
    if (previous?.id === row.id) return ok(c, { code: wanted, unchanged: true });

    // Clear first: the unique index refuses a second base, so setting before
    // clearing fails rather than overwriting.
    await db.update(schema.currencies).set({ isBase: false }).where(eq(schema.currencies.isBase, true));
    await db.update(schema.currencies).set({ isBase: true }).where(eq(schema.currencies.id, row.id));

    await logAudit(c.env, user.id, 'UPDATE', 'currencies', row.id, {
      base: wanted,
      previousBase: previous?.code ?? null,
      note: 'relabels existing figures; does not convert them',
    });
    return ok(c, { code: wanted, previousBase: previous?.code ?? null });
  } catch (err) { return serverError(c, err); }
});

currenciesRouter.post('/', requireFeatureAccess('finance', 'accounts', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user' as any);
    const body = await c.req.json<{ code?: string; name?: string; symbol?: string }>();

    const code = normaliseCurrencyCode(body.code);
    if (!code) return badRequest(c, 'code must be a three-letter currency code, e.g. PKR');

    // The unique index would reject this anyway, as a 500. Saying so plainly is
    // the difference between "already added" and "something went wrong".
    const existing = await db.query.currencies.findFirst({ where: eq(schema.currencies.code, code) });
    if (existing) {
      if (!existing.isActive) {
        await db.update(schema.currencies).set({ isActive: true }).where(eq(schema.currencies.id, existing.id));
        await logAudit(c.env, user.id, 'UPDATE', 'currencies', existing.id, { reactivated: code });
        return ok(c, { id: existing.id, code, reactivated: true });
      }
      return c.json({ success: false, error: `${code} is already available.` }, 409);
    }

    const id = generateId('cur');
    await db.insert(schema.currencies).values({
      id,
      code,
      name: (body.name || '').trim() || null,
      symbol: (body.symbol || '').trim() || null,
      isActive: true,
      createdByUserId: user.id,
      createdAt: new Date(),
    });
    await logAudit(c.env, user.id, 'CREATE', 'currencies', id, { code });
    return created(c, { id, code });
  } catch (err) { return serverError(c, err); }
});

currenciesRouter.patch('/:id', requireFeatureAccess('finance', 'accounts', 'edit'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user' as any);
    const id = c.req.param('id');
    const body = await c.req.json<{ name?: string; symbol?: string; isActive?: boolean }>();

    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch.name = String(body.name).trim() || null;
    if (body.symbol !== undefined) patch.symbol = String(body.symbol).trim() || null;
    if (body.isActive !== undefined) patch.isActive = !!body.isActive;
    // Retiring the base has the same problem as deleting it; `isBase` is not
    // settable here at all, so the only way to move it is PUT /base.
    if (body.isActive === false) {
      const row = await db.query.currencies.findFirst({ where: eq(schema.currencies.id, id) });
      if (row?.isBase) return badRequest(c, `${row.code} is the company's base currency and cannot be retired. Make another currency the base first.`);
    }
    // The code is the key accounts already store; changing it would silently
    // orphan every account denominated in the old one.
    if (Object.keys(patch).length === 0) return badRequest(c, 'Nothing to update');

    await db.update(schema.currencies).set(patch).where(eq(schema.currencies.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'currencies', id, patch);
    return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});

currenciesRouter.delete('/:id', requireFeatureAccess('finance', 'accounts', 'delete'), async (c) => {
  try {
    const db = getDb(c.env);
    const user = c.get('user' as any);
    const id = c.req.param('id');

    const row = await db.query.currencies.findFirst({ where: eq(schema.currencies.id, id) });
    if (!row) return notFound(c);

    // Removing the base would leave every amount that names no currency with no
    // symbol at all — which is most of the amounts in the app.
    if (row.isBase) {
      return badRequest(c, `${row.code} is the company's base currency. Make another currency the base before removing it.`);
    }

    // An account already denominated in it keeps its label; the currency is
    // retired from the dropdown instead of deleted out from under the data.
    const inUse = await db.query.accounts.findMany({ where: eq(schema.accounts.currency, row.code) });
    if (inUse.length > 0) {
      await db.update(schema.currencies).set({ isActive: false }).where(eq(schema.currencies.id, id));
      await logAudit(c.env, user.id, 'UPDATE', 'currencies', id, { retired: row.code, accounts: inUse.length });
      return ok(c, { id, retired: true, accounts: inUse.length });
    }

    await db.delete(schema.currencies).where(eq(schema.currencies.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'currencies', id, { code: row.code });
    return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

export default currenciesRouter;
