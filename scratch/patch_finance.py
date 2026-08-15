import re

with open('apps/web/src/pages/Finance.tsx', 'r') as f:
    content = f.read()

# 1. Update Tab type
content = re.sub(
    r"type Tab = 'transactions' \| 'invoices' \| 'fund-requests' \| 'accounts' \| 'channels' \| 'tasks';",
    "type Tab = 'ledgers' | 'journals' | 'trial-balance' | 'invoices' | 'fund-requests' | 'accounts' | 'channels' | 'tasks';",
    content
)

# 2. Add state variables
content = re.sub(
    r"const \[channels, setChannels\] = useState<any\[\]>\(\[\]\);",
    "const [channels, setChannels] = useState<any[]>([]);\n  const [ledgers, setLedgers] = useState<any[]>([]);\n  const [trialBalanceData, setTrialBalanceData] = useState<any>(null);\n  const [startDate, setStartDate] = useState('');\n  const [endDate, setEndDate] = useState('');",
    content
)

# 3. Update fetchData
fetch_data_old = """  const fetchData = () => {
    if (!permsLoaded) return;
    setLoading(true);
    fetch(`${API}/finance/${tab}`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => {
        if (r.status === 401) { handleLogout(); throw new Error('Unauthorized'); }
        return r.json();
      })
      .then(d => { setData(d.data || []); setLoading(false); })
      .catch(() => setLoading(false));
  };"""
fetch_data_new = """  const fetchData = () => {
    if (!permsLoaded) return;
    setLoading(true);
    let url = `${API}/finance/${tab}`;
    if (tab === 'journals') {
      url += `?startDate=${startDate}&endDate=${endDate}`;
    }
    fetch(url, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => {
        if (r.status === 401) { handleLogout(); throw new Error('Unauthorized'); }
        return r.json();
      })
      .then(d => {
        if (tab === 'trial-balance') {
          setTrialBalanceData(d.data || null);
        } else {
          setData(d.data || []);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };"""
content = content.replace(fetch_data_old, fetch_data_new)

# 4. Add ledgers to relations
content = re.sub(
    r"fetchWithAuth\(`\$\{API\}/finance/accounts`, setAccounts\);",
    "fetchWithAuth(`${API}/finance/ledgers`, setLedgers);\n    fetchWithAuth(`${API}/finance/accounts`, setAccounts);",
    content
)

# 5. Dependency array for useEffect
content = re.sub(
    r"\[tab, isAuthenticated, permsLoaded\]\)",
    "[tab, isAuthenticated, permsLoaded, startDate, endDate])",
    content
)

# 6. Update TABS
tabs_old = """    const all = [
      { id: 'transactions', label: 'Ledger', icon: Receipt, feature: 'transactions' },
      { id: 'invoices', label: 'Invoices', icon: FileText, feature: 'invoices' },
      { id: 'fund-requests', label: 'Fund Requests', icon: ArrowUpRight, feature: 'fund_requests' },
      { id: 'accounts', label: 'Accounts', icon: CreditCard, feature: 'accounts' },
      { id: 'channels', label: 'Channels', icon: Wallet, feature: 'channels' },
      { id: 'tasks', label: 'Tasks', icon: Receipt, feature: 'tasks' },
    ] as const;"""
tabs_new = """    const all = [
      { id: 'ledgers', label: 'Ledgers', icon: Wallet, feature: 'ledgers' },
      { id: 'accounts', label: 'Accounts', icon: CreditCard, feature: 'accounts' },
      { id: 'journals', label: 'General Journal', icon: Receipt, feature: 'journals' },
      { id: 'trial-balance', label: 'Trial Balance', icon: FileText, feature: 'trial_balance' },
      { id: 'invoices', label: 'Invoices', icon: FileText, feature: 'invoices' },
      { id: 'fund-requests', label: 'Fund Requests', icon: ArrowUpRight, feature: 'fund_requests' },
      { id: 'channels', label: 'Channels', icon: Wallet, feature: 'channels' },
      { id: 'tasks', label: 'Tasks', icon: Receipt, feature: 'tasks' },
    ] as const;"""
content = content.replace(tabs_old, tabs_new)

# 7. Update currentFeature fallback
content = re.sub(
    r"const currentFeature = TABS\.find\(t => t\.id === tab\)\?\.feature \|\| 'transactions';",
    "const currentFeature = TABS.find(t => t.id === tab)?.feature || 'ledgers';",
    content
)

# 8. Main rendering block
main_old = """        {tab !== 'tasks' && (
          <GAGrid"""

main_new = """        {tab !== 'tasks' && tab !== 'trial-balance' && (
          <div className="space-y-4">
            {(tab === 'journals' || tab === 'ledgers') && (
              <div className="flex flex-col md:flex-row gap-4 items-end glass-panel p-4 rounded-2xl border border-white/10">
                <div className="flex-1 w-full md:w-auto">
                  <label className="text-xs text-textSecondary mb-1 block">Start Date</label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm text-white" />
                </div>
                <div className="flex-1 w-full md:w-auto">
                  <label className="text-xs text-textSecondary mb-1 block">End Date</label>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm text-white" />
                </div>
                <button 
                  onClick={() => window.open(`${API}/finance/export/${tab}?startDate=${startDate}&endDate=${endDate}`, '_blank')}
                  className="w-full md:w-auto px-6 py-2 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded-xl font-bold text-sm transition-all border border-emerald-500/30"
                >
                  Export CSV
                </button>
              </div>
            )}
          <GAGrid"""
content = content.replace(main_old, main_new)

# Need to close the new <div> we opened in main_new
gagrid_close_old = """            canDelete={p.canDelete}
          />
        )}"""
gagrid_close_new = """            canDelete={p.canDelete}
          />
          </div>
        )}
        {tab === 'trial-balance' && trialBalanceData && (
          <div className="glass-panel p-6 md:p-8 rounded-[2.5rem] border border-white/10 shadow-2xl">
            <h2 className="text-2xl font-black mb-6 flex items-center gap-3">
              <FileText className="w-6 h-6 text-emerald-400" />
              Trial Balance
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-textSecondary text-xs tracking-widest uppercase">
                    <th className="p-4 font-black">Account</th>
                    <th className="p-4 font-black text-right">Debit</th>
                    <th className="p-4 font-black text-right">Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {trialBalanceData.balances.map((b: any) => (
                    <tr key={b.id} className="hover:bg-white/5 transition-colors">
                      <td className="p-4">
                        <div className="font-bold">{b.accountName}</div>
                        <div className="text-xs text-textSecondary">{b.accountNumber}</div>
                      </td>
                      <td className="p-4 text-right font-mono text-emerald-400">{b.type === 'debit' ? `$${b.amount.toLocaleString()}` : '-'}</td>
                      <td className="p-4 text-right font-mono text-rose-400">{b.type === 'credit' ? `$${b.amount.toLocaleString()}` : '-'}</td>
                    </tr>
                  ))}
                  <tr className="bg-black/20 font-black text-lg">
                    <td className="p-4 text-right">TOTAL</td>
                    <td className="p-4 text-right font-mono text-emerald-400 border-t-2 border-emerald-500/30">${trialBalanceData.totalDebit.toLocaleString()}</td>
                    <td className="p-4 text-right font-mono text-rose-400 border-t-2 border-rose-500/30">${trialBalanceData.totalCredit.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className={`mt-6 p-4 rounded-xl text-center font-bold border ${trialBalanceData.isBalanced ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
              {trialBalanceData.isBalanced ? '✅ Accounts are Balanced' : '❌ Accounts are NOT Balanced'}
            </div>
          </div>
        )}"""
content = content.replace(gagrid_close_old, gagrid_close_new)


# 9. Columns configuration
columns_old = """              tab === 'transactions' ? [
                { key: 'name', label: 'Name' },
                { key: 'description', label: 'Description' },
                { key: 'amount', label: 'Amount', type: 'currency' as const },
                { key: 'transactionType', label: 'Type', type: 'badge' as const },
                { key: 'transactionDate', label: 'Date', type: 'date' as const },
                { key: 'approved', label: 'Approved', render: (v: any) => v ? '✅ Yes' : '⏳ Pending' },
              ] : tab === 'invoices' ? ["""
columns_new = """              tab === 'ledgers' ? [
                { key: 'ledgerName', label: 'Ledger Name' },
                { key: 'description', label: 'Description' },
                { key: 'createdAt', label: 'Created At', type: 'date' as const },
              ] : tab === 'journals' ? [
                { key: 'entryDate', label: 'Date', type: 'date' as const },
                { key: 'description', label: 'Description' },
                { key: 'amount', label: 'Amount', type: 'currency' as const },
                { key: 'debitAccountId', label: 'Debit Account', render: (v: any) => accounts.find(a => a.id === v)?.accountName || v },
                { key: 'creditAccountId', label: 'Credit Account', render: (v: any) => accounts.find(a => a.id === v)?.accountName || v },
                { key: 'ledgerId', label: 'Ledger', render: (v: any) => ledgers.find(l => l.id === v)?.ledgerName || v },
              ] : tab === 'invoices' ? ["""
content = content.replace(columns_old, columns_new)

# 10. Forms configuration
forms_old = """            tab === 'transactions' ? [
              { key: 'name', label: 'Transaction Name', type: 'text' as const, required: true },
              { key: 'description', label: 'Description', type: 'textarea' as const },
              { key: 'amount', label: 'Amount ($)', type: 'number' as const, required: true },
              {
                key: 'transactionType', label: 'Type', type: 'select' as const, options: [
                  { value: 'income', label: 'Income' }, { value: 'expense', label: 'Expense' },
                  { value: 'transfer', label: 'Transfer' }, { value: 'refund', label: 'Refund' },
                ], required: true
              },
              { key: 'transactionDate', label: 'Transaction Date', type: 'date' as const },
              { key: 'approved', label: 'Approved', type: 'select' as const, options: [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] },
              { key: 'createdBy', label: 'Created By', type: 'text' as const },
              { key: 'accountId', label: 'Account', type: 'select' as const, options: accounts.map(a => ({ value: a.id, label: a.accountName })), action: { label: '+ New Account', onClick: () => setShowNestedForm('account') } },
              { key: 'channelId', label: 'Channel', type: 'select' as const, options: channels.map(c => ({ value: c.id, label: c.channelName })), action: { label: '+ New Channel', onClick: () => setShowNestedForm('channel') } },
              { key: 'committeeId', label: 'Committee', type: 'select' as const, options: committees.map(c => ({ value: c.id, label: c.committeeName })) },
              { key: 'clientId', label: 'Client', type: 'select' as const, options: clients.map(c => ({ value: c.id, label: c.clientName })) },
              { key: 'invoiceId', label: 'Linked Invoice', type: 'select' as const, options: invoices.map(i => ({ value: i.id, label: i.invoiceNumber })), action: { label: '+ New Invoice', onClick: () => setShowSecondaryForm(true) } },
              { key: 'fundRequestId', label: 'Fund Request', type: 'select' as const, options: fundRequests.map(f => ({ value: f.id, label: f.requestName })), action: { label: '+ New Request', onClick: () => setShowNestedForm('fund-request') } },
            ] : tab === 'invoices' ? ["""

forms_new = """            tab === 'ledgers' ? [
              { key: 'ledgerName', label: 'Ledger Name', type: 'text' as const, required: true },
              { key: 'description', label: 'Description', type: 'textarea' as const },
            ] : tab === 'journals' ? [
              { key: 'entryDate', label: 'Entry Date', type: 'date' as const, required: true },
              { key: 'description', label: 'Description', type: 'textarea' as const },
              { key: 'ledgerId', label: 'Ledger', type: 'select' as const, options: ledgers.map(l => ({ value: l.id, label: l.ledgerName })), required: true },
              { key: 'debitAccountId', label: 'Debit Account', type: 'select' as const, options: accounts.map(a => ({ value: a.id, label: a.accountName })), action: { label: '+ New Account', onClick: () => setShowNestedForm('account') }, required: true },
              { key: 'creditAccountId', label: 'Credit Account', type: 'select' as const, options: accounts.map(a => ({ value: a.id, label: a.accountName })), required: true },
              { key: 'amount', label: 'Amount ($)', type: 'number' as const, required: true },
            ] : tab === 'invoices' ? ["""
content = content.replace(forms_old, forms_new)

# 11. Add ledgerId to Accounts form
acc_forms_old = """            ] : tab === 'accounts' ? [
              { key: 'accountName', label: 'Account Name', type: 'text' as const, required: true },"""
acc_forms_new = """            ] : tab === 'accounts' ? [
              { key: 'ledgerId', label: 'Linked Ledger', type: 'select' as const, options: ledgers.map(l => ({ value: l.id, label: l.ledgerName })) },
              { key: 'accountName', label: 'Account Name', type: 'text' as const, required: true },"""
content = content.replace(acc_forms_old, acc_forms_new)

# 12. Also in the nested 'account' form
nested_acc_old = """      {showNestedForm === 'account' && (
        <EntityForm
          title="New Account"
          fields={[
            { key: 'accountName', label: 'Account Name', type: 'text' as const, required: true },"""
nested_acc_new = """      {showNestedForm === 'account' && (
        <EntityForm
          title="New Account"
          fields={[
            { key: 'ledgerId', label: 'Linked Ledger', type: 'select' as const, options: ledgers.map(l => ({ value: l.id, label: l.ledgerName })) },
            { key: 'accountName', label: 'Account Name', type: 'text' as const, required: true },"""
content = content.replace(nested_acc_old, nested_acc_new)

with open('apps/web/src/pages/Finance.tsx', 'w') as f:
    f.write(content)

