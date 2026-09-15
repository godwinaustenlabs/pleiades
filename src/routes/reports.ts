import { Hono, type Context } from 'hono';
import { desc, eq, inArray } from 'drizzle-orm';
import { getDb, schema } from '@pleiades/database';
import { Env } from '../index';
import type { UserPayload } from '../middleware/auth';
import { checkFeaturePermission } from '../middleware/rbac';
import { logAudit } from '../utils/audit';
import { ok, badRequest, forbidden, serverError } from '../utils/response';
import {
  generateJournalReport,
  generateLedgerReport,
  type ReportResult,
} from '../statements/reports-render';

/**
 * Ledger reports, under `/api/finance/reports`.
 *
 * Two of them, deliberately separate rather than one endpoint with a `type`:
 * a general journal report and a ledger report answer different questions and
 * take different arguments — one filters by book and date, the other picks a
 * scope of accounts — and collapsing them would mean a single schema where
 * half the fields are ignored depending on the other half.
 *
 * **Gating.** Each is gated on the feature that owns the data it transcribes:
 * `finance/journals` for the journal, `finance/ledgers` for the ledger. Not on
 * `finance/docs`, which is what the statements route uses, and the difference
 * matters: a statement is a handful of summary figures, whereas these print
 * every entry in the books. Gating a verbatim transcript of `general_journals`
 * on "may read finance documents" would hand the whole journal to anyone with
 * a documents grant. `src/routes/assets.ts` carries the matching read rules on
 * `finance-docs/reports/journal/` and `.../ledger/`, so the permission needed
 * to generate one and the permission needed to download it are the same.
 *
 * This is why the feature adds no entry to `APP_FEATURES` and needs no
 * migration granting it: it reuses two features that already exist and that
 * everyone who works with the ledger already holds.
 */
const reportsRouter = new Hono<{ Bindings: Env; Variables: { user: UserPayload } }>();

const DOC_TYPES = {
  journal: 'general_journal_report',
  ledger: 'ledger_report',
} as const;

const PREFIX = 'finance-docs/reports/';

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
 * Which recorded reports still have a file behind them.
 *
 * One `list` over the reports prefix rather than a `head` per row — the same
 * argument as `statements.ts`, and for the same reason: the page shows up to a
 * hundred, and a hundred round trips to answer one question is a hundred round
 * trips.
 */
async function presentKeys(bucket: R2Bucket): Promise<Set<string>> {
  const present = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix: PREFIX, cursor });
    for (const obj of page.objects) present.add(obj.key);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return present;
}

/**
 * Lists generated reports, newest first.
 *
 * Filtered by what the caller may read rather than refused outright: someone
 * with `ledgers` but not `journals` sees their ledger reports and simply is not
 * told the journal ones exist, which is the same answer they would get from
 * every other route in this module.
 */
reportsRouter.get('/', async (c) => {
  try {
    const wanted: string[] = [];
    if (await checkFeaturePermission(c, 'finance', 'journals', 'view')) wanted.push(DOC_TYPES.journal);
    if (await checkFeaturePermission(c, 'finance', 'ledgers', 'view')) wanted.push(DOC_TYPES.ledger);
    if (wanted.length === 0) {
      return forbidden(c, 'You need journal or ledger access to see generated reports.');
    }

    const rows = await getDb(c.env)
      .select()
      .from(schema.generatedDocuments)
      .where(inArray(schema.generatedDocuments.docType, wanted))
      .orderBy(desc(schema.generatedDocuments.createdAt))
      .limit(100);

    const shaped = rows.map((r) => ({
      ...r,
      generationBasis: r.generationBasis ? JSON.parse(r.generationBasis) : null,
      r2Key: keyFromFileUrl(r.fileUrl),
    }));

    if (!c.env.CRM_BUCKET) return ok(c, { reports: shaped, missing: 0 });

    // The bucket is the authority on what can be downloaded. A row whose file
    // has been removed describes a report that no longer exists, and listing it
    // produces a Download button that can only ever fail. The row is kept —
    // `generated_documents` records that a report was produced and from which
    // figures, and deleting the file does not unmake that.
    const present = await presentKeys(c.env.CRM_BUCKET);
    const available = shaped.filter((r) => r.r2Key && present.has(r.r2Key));

    return ok(c, { reports: available, missing: shaped.length - available.length });
  } catch (err) { return serverError(c, err); }
});

/** Shared shape for both POSTs: a range where either end may be absent. */
function range(body: any) {
  // '' from an empty date input means "no bound", not an invalid date. The UI
  // clears a field to ask for all time, and that has to reach here as null.
  const norm = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return { startDate: norm(body.startDate), endDate: norm(body.endDate) };
}

/**
 * Who asked, for the footer of every page.
 *
 * Resolved against `users_logins` rather than taken from the JWT: the token
 * carries only an id (see the note on the JWT in CLAUDE.md), so "requested by
 * usr_9f3a…" is all the payload can offer, and a provenance line nobody can
 * read is a provenance line nobody checks. One query per report, which is
 * nothing beside rendering the document.
 *
 * An agent is named as an agent *and* as the person it acts for. Both matter:
 * one is what produced the file, the other is whose access allowed it.
 */
async function requestedVia(env: Env, user: UserPayload): Promise<string> {
  let who = user.id;
  try {
    const row = await getDb(env).query.usersLogins.findFirst({
      where: eq(schema.usersLogins.id, user.id),
      columns: { name: true, email: true },
    });
    if (row?.name) who = row.name;
    else if (row?.email) who = row.email;
  } catch {
    // A footer is not worth failing a report over.
  }
  return user.type === 'agent'
    ? `requested by ${user.agentName || 'an agent'}, acting for ${who}`
    : `requested by ${who}`;
}

async function record(
  c: Context<{ Bindings: Env; Variables: { user: UserPayload } }>,
  user: UserPayload,
  result: ReportResult,
  extra: Record<string, unknown>,
) {
  await logAudit(c.env, user.id, 'CREATE', 'generated_documents', result.docId, {
    docType: result.docType,
    periodLabel: result.periodLabel,
    version: result.version,
    ...extra,
  });
  return ok(c, result);
}

/**
 * The general journal over a date range — every entry, both sides, narration.
 *
 * Both dates are optional and an absent one means "no bound", so omitting both
 * asks for the complete history. That is a supported request, not an accident
 * to be defended against: "print the whole journal" is what gets asked for
 * when the books are being handed to an accountant.
 */
reportsRouter.post('/journal', async (c) => {
  try {
    if (!(await checkFeaturePermission(c, 'finance', 'journals', 'view'))) {
      return forbidden(c, 'You need journal access to generate a general journal report.');
    }
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));

    const result = await generateJournalReport(c.env, {
      ...range(body),
      ledgerId: typeof body.ledgerId === 'string' && body.ledgerId ? body.ledgerId : null,
      actorUserId: user.id,
      requestedVia: await requestedVia(c.env, user),
    });
    if ('error' in result) return badRequest(c, result.error);

    return record(c, user, result, { ledgerId: body.ledgerId ?? null });
  } catch (err) { return serverError(c, err); }
});

/**
 * The ledger accounts: one account, one book, or every account.
 *
 * `scope` is explicit rather than inferred from which id happens to be present.
 * Inferring it would make "all accounts" the meaning of a request that merely
 * forgot to include the account id — the widest possible report produced by the
 * narrowest possible mistake.
 */
reportsRouter.post('/ledger', async (c) => {
  try {
    if (!(await checkFeaturePermission(c, 'finance', 'ledgers', 'view'))) {
      return forbidden(c, 'You need ledger access to generate a ledger report.');
    }
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));

    const scope = body.scope;
    if (scope !== 'account' && scope !== 'ledger' && scope !== 'all') {
      return badRequest(c, 'scope must be one of: account, ledger, all.');
    }

    const result = await generateLedgerReport(c.env, {
      ...range(body),
      scope,
      accountId: typeof body.accountId === 'string' && body.accountId ? body.accountId : null,
      ledgerId: typeof body.ledgerId === 'string' && body.ledgerId ? body.ledgerId : null,
      actorUserId: user.id,
      requestedVia: await requestedVia(c.env, user),
    });
    if ('error' in result) return badRequest(c, result.error);

    return record(c, user, result, { scope, accountId: body.accountId ?? null, ledgerId: body.ledgerId ?? null });
  } catch (err) { return serverError(c, err); }
});

export default reportsRouter;
