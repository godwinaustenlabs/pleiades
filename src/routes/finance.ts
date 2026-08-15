import { Hono } from 'hono';
import { eq, and, gte, lte, lt, or } from 'drizzle-orm';
import { getDb, schema } from '@ganova/database';

function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getDefaultDates(startDateParam?: string, endDateParam?: string) {
  if (startDateParam && endDateParam) {
    return { startDate: startDateParam, endDate: endDateParam };
  }
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const day = today.getDate();
  let start: Date;
  let end: Date;
  if (day >= 15) {
    start = new Date(year, month, 15);
    end = new Date(year, month + 1, 15);
  } else {
    start = new Date(year, month - 1, 15);
    end = new Date(year, month, 15);
  }
  return {
    startDate: startDateParam || formatDate(start),
    endDate: endDateParam || formatDate(end)
  };
}

function getJournalLines(journal: any) {
  if (journal.lines) {
    try {
      return typeof journal.lines === 'string' ? JSON.parse(journal.lines) : journal.lines;
    } catch (e) {
      return [];
    }
  }
  return [
    { accountId: journal.debitAccountId, type: 'debit', amount: journal.amount },
    { accountId: journal.creditAccountId, type: 'credit', amount: journal.amount }
  ].filter(l => l.accountId);
}

import { Env } from '../index';
import { authMiddleware } from '../middleware/auth';
import { requireAppAccess } from '../middleware/rbac';
import { generateId } from '../utils/id';
import { logAudit } from '../utils/audit';
import { ok, created, notFound, serverError } from '../utils/response';

const financeRouter = new Hono<{ Bindings: Env }>();
financeRouter.use('*', authMiddleware);
financeRouter.use('*', requireAppAccess('finance'));

/* ── LEDGERS ── */
financeRouter.get('/ledgers', async (c) => {
  try { return ok(c, await getDb(c.env).query.ledgers.findMany()); }
  catch (err) { return serverError(c, err); }
});
financeRouter.post('/ledgers', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('ldg');
    await db.insert(schema.ledgers).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'ledgers', id, body); return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
financeRouter.get('/ledgers/:id', async (c) => {
  try {
    const row = await getDb(c.env).query.ledgers.findFirst({ where: eq(schema.ledgers.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
financeRouter.patch('/ledgers/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.ledgers).set(body).where(eq(schema.ledgers.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'ledgers', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
financeRouter.delete('/ledgers/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    // Check if any accounts are linked to this ledger
    const linkedAccounts = await db.query.accounts.findMany({ where: eq(schema.accounts.ledgerId, id) });
    if (linkedAccounts.length > 0) {
      const names = linkedAccounts.map(a => a.accountName).join(', ');
      return c.json({ error: `Cannot delete this ledger. Please delete or unlink these accounts first: ${names}` }, 409);
    }
    await db.delete(schema.ledgers).where(eq(schema.ledgers.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'ledgers', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── ACCOUNTS ── */
financeRouter.get('/accounts', async (c) => {
  try {
    const db = getDb(c.env);
    const { startDate, endDate } = c.req.query();
    const { startDate: start, endDate: end } = getDefaultDates(startDate, endDate);

    const allAccounts = await db.query.accounts.findMany();
    const allJournals = await db.query.generalJournals.findMany();

    const accountsWithBalance = allAccounts.map(acc => {
      // Calculate dynamic opening balance: sum of entries before startDate
      let debitsPrior = 0;
      let creditsPrior = 0;
      
      const priorJournals = allJournals.filter(j => 
        j.entryDate && j.entryDate < start && getJournalLines(j).some((l: any) => l.accountId === acc.id)
      );
      
      for (const j of priorJournals) {
        for (const line of getJournalLines(j)) {
          if (line.accountId === acc.id) {
            if (line.type === 'debit') debitsPrior += (line.amount || 0);
            if (line.type === 'credit') creditsPrior += (line.amount || 0);
          }
        }
      }
      
      const netPrior = debitsPrior - creditsPrior;
      const openingBalance = Math.abs(netPrior);
      const openingBalanceSide = netPrior >= 0 ? 'debit' : 'credit';

      // Calculate period activity: from startDate to endDate
      let debitsPeriod = 0;
      let creditsPeriod = 0;
      
      const periodJournals = allJournals.filter(j => 
        j.entryDate && j.entryDate >= start && j.entryDate <= end && getJournalLines(j).some((l: any) => l.accountId === acc.id)
      );
      
      for (const j of periodJournals) {
        for (const line of getJournalLines(j)) {
          if (line.accountId === acc.id) {
            if (line.type === 'debit') debitsPeriod += (line.amount || 0);
            if (line.type === 'credit') creditsPeriod += (line.amount || 0);
          }
        }
      }

      // Closing balance at endDate is prior + period (which is sum of all entries <= endDate)
      const drTotal = debitsPrior + debitsPeriod;
      const crTotal = creditsPrior + creditsPeriod;
      const netClosing = drTotal - crTotal;
      const closingBalance = Math.abs(netClosing);
      const closingBalanceSide = netClosing >= 0 ? 'debit' : 'credit';

      return { 
        ...acc, 
        openingBalance, 
        openingBalanceSide, 
        closingBalance, 
        closingBalanceSide 
      };
    });

    return ok(c, accountsWithBalance);
  }
  catch (err) { return serverError(c, err); }
});

financeRouter.post('/accounts', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('acc');
    await db.insert(schema.accounts).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'accounts', id, body);
    return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
financeRouter.get('/accounts/:id', async (c) => {
  try {
    const row = await getDb(c.env).query.accounts.findFirst({ where: eq(schema.accounts.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
financeRouter.patch('/accounts/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.accounts).set(body).where(eq(schema.accounts.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'accounts', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
financeRouter.delete('/accounts/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    // Check if any journal entries reference this account
    const allJ = await db.query.generalJournals.findMany();
    const linkedJournals = allJ.filter((j: any) => getJournalLines(j).some((l: any) => l.accountId === id));
    if (linkedJournals.length > 0) {
      return c.json({ error: `Cannot delete this account. It has ${linkedJournals.length} journal entry(s) linked to it. Please delete those journal entries first.` }, 409);
    }
    await db.delete(schema.accounts).where(eq(schema.accounts.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'accounts', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});


/* ── FUND REQUESTS ── */
financeRouter.get('/fund-requests', async (c) => {
  try {
    const { status, committee_id } = c.req.query();
    const rows = await getDb(c.env).query.fundRequests.findMany({
      where: and(
        status ? eq(schema.fundRequests.approvalStatus, status) : undefined,
        committee_id ? eq(schema.fundRequests.committeeId, committee_id) : undefined
      ),
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});
financeRouter.post('/fund-requests', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('fr');
    await db.insert(schema.fundRequests).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'fund_requests', id, body); return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
financeRouter.get('/fund-requests/:id', async (c) => {
  try {
    const row = await getDb(c.env).query.fundRequests.findFirst({ where: eq(schema.fundRequests.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
financeRouter.patch('/fund-requests/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.fundRequests).set(body).where(eq(schema.fundRequests.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'fund_requests', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
financeRouter.delete('/fund-requests/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    await db.delete(schema.fundRequests).where(eq(schema.fundRequests.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'fund_requests', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── INVOICES ── */
financeRouter.get('/invoices', async (c) => {
  try {
    const { status, client_id } = c.req.query();
    const rows = await getDb(c.env).query.invoices.findMany({
      where: and(
        status ? eq(schema.invoices.status, status) : undefined,
        client_id ? eq(schema.invoices.clientId, client_id) : undefined
      ),
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});
financeRouter.post('/invoices', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('inv');
    await db.insert(schema.invoices).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'invoices', id, body); return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
financeRouter.get('/invoices/:id', async (c) => {
  try {
    const row = await getDb(c.env).query.invoices.findFirst({ where: eq(schema.invoices.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
financeRouter.patch('/invoices/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.invoices).set(body).where(eq(schema.invoices.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'invoices', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
financeRouter.delete('/invoices/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    await db.delete(schema.invoices).where(eq(schema.invoices.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'invoices', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── TRANSACTIONS ── */
financeRouter.get('/transactions', async (c) => {
  try {
    const { account_id, client_id } = c.req.query();
    const rows = await getDb(c.env).query.transactions.findMany({
      where: and(
        account_id ? eq(schema.transactions.accountId, account_id) : undefined,
        client_id ? eq(schema.transactions.clientId, client_id) : undefined
      ),
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});
financeRouter.post('/transactions', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('txn');
    if (!body.name && body.description) body.name = body.description;
    if (!body.name) body.name = 'Transaction';
    await db.insert(schema.transactions).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'transactions', id, body); return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
financeRouter.get('/transactions/:id', async (c) => {
  try {
    const row = await getDb(c.env).query.transactions.findFirst({ where: eq(schema.transactions.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
financeRouter.patch('/transactions/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.transactions).set(body).where(eq(schema.transactions.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'transactions', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
financeRouter.delete('/transactions/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    await db.delete(schema.transactions).where(eq(schema.transactions.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'transactions', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── P&L REPORTS ── */
financeRouter.get('/pl-reports', async (c) => {
  try { return ok(c, await getDb(c.env).query.plReports.findMany()); }
  catch (err) { return serverError(c, err); }
});
financeRouter.post('/pl-reports', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('pl');
    await db.insert(schema.plReports).values({ ...body, id, createdAt: new Date() });
    await logAudit(c.env, user.id, 'CREATE', 'pl_reports', id, body); return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
financeRouter.get('/pl-reports/:id', async (c) => {
  try {
    const row = await getDb(c.env).query.plReports.findFirst({ where: eq(schema.plReports.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
financeRouter.patch('/pl-reports/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt; delete body.updatedAt;
    await db.update(schema.plReports).set(body).where(eq(schema.plReports.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'pl_reports', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
financeRouter.delete('/pl-reports/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    await db.delete(schema.plReports).where(eq(schema.plReports.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'pl_reports', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── GENERAL JOURNALS ── */
financeRouter.get('/journals', async (c) => {
  try {
    const { ledger_id, startDate, endDate } = c.req.query();
    const filters = [];
    if (ledger_id) filters.push(eq(schema.generalJournals.ledgerId, ledger_id));
    if (startDate) filters.push(gte(schema.generalJournals.entryDate, startDate));
    if (endDate) filters.push(lte(schema.generalJournals.entryDate, endDate));
    
    const rows = await getDb(c.env).query.generalJournals.findMany({
      where: filters.length > 0 ? and(...filters) : undefined,
    });
    return ok(c, rows);
  } catch (err) { return serverError(c, err); }
});
financeRouter.post('/journals', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = generateId('jrn');
    
    if (body.lines) {
      const parsedLines = typeof body.lines === 'string' ? JSON.parse(body.lines) : body.lines;
      const drTotal = parsedLines.filter((l: any) => l.type === 'debit').reduce((acc: number, l: any) => acc + (l.amount || 0), 0);
      const crTotal = parsedLines.filter((l: any) => l.type === 'credit').reduce((acc: number, l: any) => acc + (l.amount || 0), 0);
      if (Math.abs(drTotal - crTotal) > 0.01) {
        return c.json({ error: 'Debits and credits must be equal.' }, 400);
      }
      body.amount = drTotal; // Fallback amount to satisfy legacy schemas
      body.lines = JSON.stringify(parsedLines);
    }
    
    await db.insert(schema.generalJournals).values({ ...body, id, createdAt: new Date() });
    
    await logAudit(c.env, user.id, 'CREATE', 'general_journals', id, body); return created(c, { id });
  } catch (err) { return serverError(c, err); }
});
financeRouter.get('/journals/:id', async (c) => {
  try {
    const row = await getDb(c.env).query.generalJournals.findFirst({ where: eq(schema.generalJournals.id, c.req.param('id')) });
    if (!row) return notFound(c); return ok(c, row);
  } catch (err) { return serverError(c, err); }
});
financeRouter.patch('/journals/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any);
    const body = await c.req.json(); const id = c.req.param('id');
    delete body.id; delete body.createdAt;

    if (body.lines) {
      const parsedLines = typeof body.lines === 'string' ? JSON.parse(body.lines) : body.lines;
      const drTotal = parsedLines.filter((l: any) => l.type === 'debit').reduce((acc: number, l: any) => acc + (l.amount || 0), 0);
      const crTotal = parsedLines.filter((l: any) => l.type === 'credit').reduce((acc: number, l: any) => acc + (l.amount || 0), 0);
      if (Math.abs(drTotal - crTotal) > 0.01) {
        return c.json({ error: 'Debits and credits must be equal.' }, 400);
      }
      body.amount = drTotal; // Fallback amount to satisfy legacy schemas
      body.lines = JSON.stringify(parsedLines);
    }

    await db.update(schema.generalJournals).set(body).where(eq(schema.generalJournals.id, id));
    await logAudit(c.env, user.id, 'UPDATE', 'general_journals', id, body); return ok(c, { id });
  } catch (err) { return serverError(c, err); }
});
financeRouter.delete('/journals/:id', async (c) => {
  try {
    const db = getDb(c.env); const user = c.get('user' as any); const id = c.req.param('id');
    // Journals have no dependents — safe to delete directly
    await db.delete(schema.generalJournals).where(eq(schema.generalJournals.id, id));
    await logAudit(c.env, user.id, 'DELETE', 'general_journals', id); return ok(c, { id, deleted: true });
  } catch (err) { return serverError(c, err); }
});

/* ── LEDGER VIEW ── */
financeRouter.get('/ledger-view', async (c) => {
  try {
    const { account_id, startDate, endDate } = c.req.query();
    if (!account_id) return c.json({ error: 'account_id required' }, 400);

    const db = getDb(c.env);
    
    const account = await db.query.accounts.findFirst({
      where: eq(schema.accounts.id, account_id)
    });
    
    if (!account) return c.json({ error: 'Account not found' }, 404);

    // Fetch prior entries for dynamic opening balance calculation
    let debitsPrior = 0;
    let creditsPrior = 0;
    if (startDate) {
      const priorEntriesAll = await db.query.generalJournals.findMany({
        where: lt(schema.generalJournals.entryDate, startDate)
      });
      const priorEntries = priorEntriesAll.filter((j: any) => getJournalLines(j).some((l: any) => l.accountId === account_id));
      for (const j of priorEntries) {
        for (const line of getJournalLines(j)) {
          if (line.accountId === account_id) {
            if (line.type === 'debit') debitsPrior += (line.amount || 0);
            if (line.type === 'credit') creditsPrior += (line.amount || 0);
          }
        }
      }
    }

    const filters = [];
    if (startDate) filters.push(gte(schema.generalJournals.entryDate, startDate));
    if (endDate) filters.push(lte(schema.generalJournals.entryDate, endDate));
    
    const rows = await db.query.generalJournals.findMany({
      where: filters.length > 0 ? and(...filters) : undefined,
    });

    const accountRows = rows.filter(r => getJournalLines(r).some((l: any) => l.accountId === account_id));
    let debits = accountRows.map(r => {
      const line = getJournalLines(r).find((l: any) => l.accountId === account_id && l.type === 'debit');
      return line ? { ...r, amount: line.amount } : null;
    }).filter(Boolean);
    let credits = accountRows.map(r => {
      const line = getJournalLines(r).find((l: any) => l.accountId === account_id && l.type === 'credit');
      return line ? { ...r, amount: line.amount } : null;
    }).filter(Boolean);

    let totalDebit = debits.reduce((acc, r: any) => acc + (r.amount || 0), 0);
    let totalCredit = credits.reduce((acc, r: any) => acc + (r.amount || 0), 0);
    
    const netPrior = debitsPrior - creditsPrior;
    const openingBalance = Math.abs(netPrior);
    if (openingBalance > 0) {
      const entry = {
        id: 'opening_balance',
        description: 'Balance b/d',
        entryDate: startDate || formatDate(account.createdAt),
        amount: openingBalance,
      };
      if (netPrior >= 0) {
        debits = [entry as any, ...debits];
        totalDebit += openingBalance;
      } else {
        credits = [entry as any, ...credits];
        totalCredit += openingBalance;
      }
    }

    const balance = totalDebit - totalCredit;
    const closingBalance = Math.abs(balance);
    const balanceSide = balance >= 0 ? 'debit' : 'credit';

    // Add "Balance c/d" to the SHORTER side so both columns total equally
    // This is the standard T-account closing technique
    const grandTotal = Math.max(totalDebit, totalCredit);
    const balanceCd = {
      id: 'balance_cd',
      description: 'Balance c/d',
      entryDate: endDate || new Date().toISOString().split('T')[0],
      amount: closingBalance,
      isBalanceEntry: true,
    };

    let finalDebits = [...debits];
    let finalCredits = [...credits];

    if (balance > 0) {
      // Dr side is larger — add Balance c/d to Cr side
      finalCredits = [...finalCredits, balanceCd as any];
    } else if (balance < 0) {
      // Cr side is larger — add Balance c/d to Dr side
      finalDebits = [...finalDebits, balanceCd as any];
    }
    // If perfectly balanced (balance === 0), no c/d entry needed

    return ok(c, {
      debits: finalDebits,
      credits: finalCredits,
      totalDebit: grandTotal,
      totalCredit: grandTotal,
      closingBalance,
      balanceSide,
    });
  } catch (err) { return serverError(c, err); }
});

/* ── TRIAL BALANCE ── */
financeRouter.get('/trial-balance', async (c) => {
  try {
    const db = getDb(c.env);
    const { startDate, endDate } = c.req.query();
    const { endDate: end } = getDefaultDates(startDate, endDate);

    const accounts = await db.query.accounts.findMany();
    
    // We only fetch journals up to the end date of the period
    const filters = [];
    if (end) filters.push(lte(schema.generalJournals.entryDate, end));

    const allJournals = await db.query.generalJournals.findMany({
      where: filters.length > 0 ? and(...filters) : undefined,
    });

    let totalDebit = 0;
    let totalCredit = 0;
    
    const balances = accounts.map(acc => {
      const accJournals = allJournals.filter(j => getJournalLines(j).some((l: any) => l.accountId === acc.id));
      let dr = 0;
      let cr = 0;
      
      for (const j of accJournals) {
        for (const line of getJournalLines(j)) {
          if (line.accountId === acc.id) {
            if (line.type === 'debit') dr += (line.amount || 0);
            if (line.type === 'credit') cr += (line.amount || 0);
          }
        }
      }
      const net = dr - cr;
      if (net > 0) {
        totalDebit += net;
        return { ...acc, type: 'debit', amount: net };
      } else if (net < 0) {
        totalCredit += Math.abs(net);
        return { ...acc, type: 'credit', amount: Math.abs(net) };
      }
      return { ...acc, type: 'zero', amount: 0 };
    });

    return ok(c, { balances, totalDebit, totalCredit, isBalanced: totalDebit === totalCredit });
  } catch (err) { return serverError(c, err); }
});

/* ── EXPORTS ── */
financeRouter.get('/export/journals', async (c) => {
  try {
    const { startDate, endDate } = c.req.query();
    const filters = [];
    if (startDate) filters.push(gte(schema.generalJournals.entryDate, startDate));
    if (endDate) filters.push(lte(schema.generalJournals.entryDate, endDate));
    const rows = await getDb(c.env).query.generalJournals.findMany({
      where: filters.length > 0 ? and(...filters) : undefined,
    });
    const header = 'ID,Date,Description,Type,Account,Amount\n';
    const csvLines: string[] = [];
    for (const r of rows) {
      const lines = getJournalLines(r);
      for (const l of lines) {
        csvLines.push(`${r.id},${r.entryDate},"${r.description}",${l.type},${l.accountId},${l.amount}`);
      }
    }
    const csv = csvLines.join('\n');
    return c.text(header + csv, 200, { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="journals.csv"' });
  } catch (err) { return serverError(c, err); }
});
financeRouter.get('/export/ledgers', async (c) => {
  try {
    const rows = await getDb(c.env).query.ledgers.findMany();
    const header = 'ID,Name,Description,Created At\n';
    const csv = rows.map(r => `${r.id},"${r.ledgerName}","${r.description}",${r.createdAt}`).join('\n');
    return c.text(header + csv, 200, { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="ledgers.csv"' });
  } catch (err) { return serverError(c, err); }
});

export default financeRouter;
