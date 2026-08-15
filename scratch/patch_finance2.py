import re

with open('apps/web/src/pages/Finance.tsx', 'r') as f:
    content = f.read()

# 1. Start date & End date + new state
old_state = """  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');"""
new_state = """  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    d.setDate(15);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedLedgerAccount, setSelectedLedgerAccount] = useState('');
  const [ledgerViewData, setLedgerViewData] = useState<any>(null);"""
content = content.replace(old_state, new_state)

# 2. Update fetchData
old_fetch = """    let url = `${API}/finance/${tab}`;
    if (tab === 'journals') {
      url += `?startDate=${startDate}&endDate=${endDate}`;
    }"""
new_fetch = """    let url = `${API}/finance/${tab}`;
    if (tab === 'journals') {
      url += `?startDate=${startDate}&endDate=${endDate}`;
    }
    if (tab === 'ledgers' && selectedLedgerAccount) {
      url = `${API}/finance/ledger-view?account_id=${selectedLedgerAccount}&startDate=${startDate}&endDate=${endDate}`;
    }
    if (tab === 'trial-balance') {
      url += `?startDate=${startDate}&endDate=${endDate}`;
    }"""
content = content.replace(old_fetch, new_fetch)

old_fetch_then = """        if (tab === 'trial-balance') {
          setTrialBalanceData(d.data || null);
        } else {
          setData(d.data || []);
        }"""
new_fetch_then = """        if (tab === 'trial-balance') {
          setTrialBalanceData(d.data || null);
        } else if (tab === 'ledgers' && selectedLedgerAccount) {
          setLedgerViewData(d.data || null);
        } else {
          setData(d.data || []);
        }"""
content = content.replace(old_fetch_then, new_fetch_then)

# 3. useEffect deps
old_deps = "[tab, isAuthenticated, permsLoaded, startDate, endDate]"
new_deps = "[tab, isAuthenticated, permsLoaded, startDate, endDate, selectedLedgerAccount]"
content = content.replace(old_deps, new_deps)

# 4. Remove currentBalance/openingBalance from forms
old_acc_fields = """              { key: 'openingBalance', label: 'Opening Balance ($)', type: 'number' as const },
              { key: 'currentBalance', label: 'Current Balance ($)', type: 'number' as const },"""
content = content.replace(old_acc_fields, "")

old_nested_acc_fields = """            { key: 'openingBalance', label: 'Opening Balance ($)', type: 'number' as const },"""
content = content.replace(old_nested_acc_fields, "")

# 5. UI layout for Ledgers tab
# Current:
#        {tab !== 'tasks' && tab !== 'trial-balance' && (
#          <div className="space-y-4">
#            {(tab === 'journals' || tab === 'ledgers') && (
#              <div className="flex flex-col md:flex-row gap-4 items-end glass-panel p-4 rounded-2xl border border-white/10">

old_ui = """        {tab !== 'tasks' && tab !== 'trial-balance' && (
          <div className="space-y-4">
            {(tab === 'journals' || tab === 'ledgers') && ("""
new_ui = """        {tab === 'ledgers' && (
          <div className="space-y-4 animate-in fade-in zoom-in-95 duration-500">
            <div className="flex flex-col md:flex-row gap-4 items-end glass-panel p-4 rounded-2xl border border-white/10">
              <div className="flex-1 w-full md:w-auto">
                <label className="text-xs text-textSecondary mb-1 block">Account</label>
                <select value={selectedLedgerAccount} onChange={e => setSelectedLedgerAccount(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm text-white">
                  <option value="">Select Account...</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.accountName}</option>)}
                </select>
              </div>
              <div className="flex-1 w-full md:w-auto">
                <label className="text-xs text-textSecondary mb-1 block">Start Date</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm text-white" />
              </div>
              <div className="flex-1 w-full md:w-auto">
                <label className="text-xs text-textSecondary mb-1 block">End Date</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm text-white" />
              </div>
            </div>
            
            {selectedLedgerAccount && ledgerViewData && (
              <div className="glass-panel p-6 md:p-10 rounded-[2.5rem] border border-white/10 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-5">
                  <Wallet className="w-32 h-32" />
                </div>
                
                <h2 className="text-2xl font-black mb-8 flex items-center gap-3 relative z-10">
                  <Wallet className="w-6 h-6 text-emerald-400" />
                  Ledger: {accounts.find(a => a.id === selectedLedgerAccount)?.accountName}
                </h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                  <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-px bg-white/10 -translate-x-1/2"></div>
                  
                  <div>
                    <h3 className="font-black text-lg mb-4 text-emerald-400 border-b border-white/10 pb-2 tracking-widest uppercase">Debit (Dr)</h3>
                    <div className="space-y-2">
                      {ledgerViewData.debits.map((d: any) => (
                        <div key={d.id} className="flex justify-between items-center text-sm py-3 px-4 hover:bg-white/5 rounded-xl border border-transparent hover:border-white/10 transition-all group">
                          <div className="flex flex-col">
                            <span className="font-bold text-white group-hover:text-emerald-400 transition-colors">{d.description || 'Entry'}</span>
                            <span className="text-[10px] text-textSecondary font-mono">{new Date(d.entryDate).toLocaleDateString()}</span>
                          </div>
                          <span className="font-mono font-black text-emerald-400">${(d.amount || 0).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="font-black text-lg mb-4 text-rose-400 border-b border-white/10 pb-2 tracking-widest uppercase">Credit (Cr)</h3>
                    <div className="space-y-2">
                      {ledgerViewData.credits.map((c: any) => (
                        <div key={c.id} className="flex justify-between items-center text-sm py-3 px-4 hover:bg-white/5 rounded-xl border border-transparent hover:border-white/10 transition-all group">
                          <div className="flex flex-col">
                            <span className="font-bold text-white group-hover:text-rose-400 transition-colors">{c.description || 'Entry'}</span>
                            <span className="text-[10px] text-textSecondary font-mono">{new Date(c.entryDate).toLocaleDateString()}</span>
                          </div>
                          <span className="font-mono font-black text-rose-400">${(c.amount || 0).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                
                <div className="mt-8 pt-6 border-t border-white/10 grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                  <div className="flex justify-between font-black text-lg px-4">
                    <span>Total Dr</span>
                    <span className="text-emerald-400 font-mono">${(ledgerViewData.totalDebit || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between font-black text-lg px-4">
                    <span>Total Cr</span>
                    <span className="text-rose-400 font-mono">${(ledgerViewData.totalCredit || 0).toLocaleString()}</span>
                  </div>
                </div>
                
                <div className="mt-8 flex justify-center relative z-10">
                  <div className={`px-8 py-4 rounded-2xl border-2 font-black text-xl flex gap-4 items-center shadow-2xl ${ledgerViewData.balanceSide === 'debit' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-emerald-500/20' : 'bg-rose-500/10 border-rose-500/30 text-rose-400 shadow-rose-500/20'}`}>
                    <span>Balance c/d:</span>
                    <span className="font-mono">${Math.abs(ledgerViewData.balance || 0).toLocaleString()}</span>
                    <span className="text-xs uppercase tracking-widest bg-black/40 px-3 py-1.5 rounded-lg border border-white/10">{ledgerViewData.balanceSide}</span>
                  </div>
                </div>
              </div>
            )}
            
            {!selectedLedgerAccount && (
              <div className="glass-panel p-16 rounded-[2.5rem] border border-white/10 text-center text-textSecondary shadow-2xl flex flex-col items-center justify-center">
                <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mb-6 border border-white/10 shadow-inner">
                  <Wallet className="w-10 h-10 opacity-50" />
                </div>
                <h3 className="text-xl font-bold mb-2 text-white">No Account Selected</h3>
                <p className="max-w-sm mx-auto text-sm">Please select an account from the dropdown above to view its dynamic T-Account ledger and transaction history.</p>
              </div>
            )}
          </div>
        )}

        {tab !== 'tasks' && tab !== 'trial-balance' && tab !== 'ledgers' && (
          <div className="space-y-4">
            {tab === 'journals' && ("""
content = content.replace(old_ui, new_ui)

# Need to update columns for ledgers to just not be rendered or remove ledgers from GAGrid
old_gagrid = """              tab === 'ledgers' ? [
                { key: 'ledgerName', label: 'Ledger Name' },
                { key: 'description', label: 'Description' },
                { key: 'createdAt', label: 'Created At', type: 'date' as const },
              ] : tab === 'journals' ? ["""
new_gagrid = """              tab === 'journals' ? ["""
content = content.replace(old_gagrid, new_gagrid)


with open('apps/web/src/pages/Finance.tsx', 'w') as f:
    f.write(content)
