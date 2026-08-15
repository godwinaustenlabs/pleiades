import re

with open('src/routes/finance.ts', 'r') as f:
    content = f.read()

# Fix 1: /ledger-view
old_ledger_view = """/* ── LEDGER VIEW ── */
financeRouter.get('/ledger-view', async (c) => {
  try {
    const { account_id, startDate, endDate } = c.req.query();
    if (!account_id) return c.json({ error: 'account_id required' }, 400);

    const filters = [];
    if (startDate) filters.push(gte(schema.generalJournals.entryDate, startDate));
    if (endDate) filters.push(lte(schema.generalJournals.entryDate, endDate));

    const db = getDb(c.env);
    
    const rows = await db.query.generalJournals.findMany({
      where: filters.length > 0 ? and(...filters) : undefined,
    });

    const accountRows = rows.filter(r => r.debitAccountId === account_id || r.creditAccountId === account_id);
    const debits = accountRows.filter(r => r.debitAccountId === account_id);
    const credits = accountRows.filter(r => r.creditAccountId === account_id);

    const totalDebit = debits.reduce((acc, r) => acc + (r.amount || 0), 0);
    const totalCredit = credits.reduce((acc, r) => acc + (r.amount || 0), 0);
    const balance = totalDebit - totalCredit;

    return ok(c, { debits, credits, totalDebit, totalCredit, balance, balanceSide: balance >= 0 ? 'debit' : 'credit' });
  } catch (err) { return serverError(c, err); }
});"""

new_ledger_view = """/* ── LEDGER VIEW ── */
financeRouter.get('/ledger-view', async (c) => {
  try {
    const { account_id, startDate, endDate } = c.req.query();
    if (!account_id) return c.json({ error: 'account_id required' }, 400);

    const db = getDb(c.env);
    
    const account = await db.query.accounts.findFirst({
      where: eq(schema.accounts.id, account_id)
    });
    
    if (!account) return c.json({ error: 'Account not found' }, 404);

    const filters = [];
    if (startDate) filters.push(gte(schema.generalJournals.entryDate, startDate));
    if (endDate) filters.push(lte(schema.generalJournals.entryDate, endDate));
    
    const rows = await db.query.generalJournals.findMany({
      where: filters.length > 0 ? and(...filters) : undefined,
    });

    const accountRows = rows.filter(r => r.debitAccountId === account_id || r.creditAccountId === account_id);
    let debits = accountRows.filter(r => r.debitAccountId === account_id);
    let credits = accountRows.filter(r => r.creditAccountId === account_id);

    let totalDebit = debits.reduce((acc, r) => acc + (r.amount || 0), 0);
    let totalCredit = credits.reduce((acc, r) => acc + (r.amount || 0), 0);
    
    const openingBalance = account.openingBalance || 0;
    if (openingBalance > 0) {
      const isDebitNormal = ['asset', 'expense'].includes(account.accountType?.toLowerCase() || '');
      if (isDebitNormal) {
        debits = [{ id: 'opening_balance', description: 'Balance b/d', entryDate: startDate || account.createdAt.toISOString(), amount: openingBalance } as any, ...debits];
        totalDebit += openingBalance;
      } else {
        credits = [{ id: 'opening_balance', description: 'Balance b/d', entryDate: startDate || account.createdAt.toISOString(), amount: openingBalance } as any, ...credits];
        totalCredit += openingBalance;
      }
    }

    const balance = totalDebit - totalCredit;

    return ok(c, { debits, credits, totalDebit, totalCredit, balance, balanceSide: balance >= 0 ? 'debit' : 'credit' });
  } catch (err) { return serverError(c, err); }
});"""
content = content.replace(old_ledger_view, new_ledger_view)


# Fix 2: /trial-balance
old_trial = """    const balances = accounts.map(acc => {
      const accJournals = allJournals.filter(j => j.debitAccountId === acc.id || j.creditAccountId === acc.id);
      let dr = 0;
      let cr = 0;
      for (const j of accJournals) {
        if (j.debitAccountId === acc.id) dr += (j.amount || 0);
        if (j.creditAccountId === acc.id) cr += (j.amount || 0);
      }
      const net = dr - cr;"""

new_trial = """    const balances = accounts.map(acc => {
      const accJournals = allJournals.filter(j => j.debitAccountId === acc.id || j.creditAccountId === acc.id);
      let dr = 0;
      let cr = 0;
      
      const openingBalance = acc.openingBalance || 0;
      if (openingBalance > 0) {
        const isDebitNormal = ['asset', 'expense'].includes(acc.accountType?.toLowerCase() || '');
        if (isDebitNormal) dr += openingBalance;
        else cr += openingBalance;
      }
      
      for (const j of accJournals) {
        if (j.debitAccountId === acc.id) dr += (j.amount || 0);
        if (j.creditAccountId === acc.id) cr += (j.amount || 0);
      }
      const net = dr - cr;"""
content = content.replace(old_trial, new_trial)

with open('src/routes/finance.ts', 'w') as f:
    f.write(content)

