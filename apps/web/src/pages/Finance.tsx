import { useState, useEffect, useMemo } from 'react';
import {
  Wallet, Receipt, CreditCard, ArrowUpRight, LogOut,
  FileText, Home, Loader2, Lock, Book, Calculator, Package
} from 'lucide-react';
import Login from './Login';
import GAGrid from '../components/GAGrid';
import EntityForm from '../components/EntityForm';
import ProfileModal from '../components/ProfileModal';
import TaskBoard from '../components/TaskBoard';
import NotificationCenter from '../components/NotificationCenter';
import MobileTabMenu from '../components/MobileTabMenu';
import JournalEntryForm from '../components/JournalEntryForm';
import DocumentsTab from '../components/DocumentsTab';
import AccountantPanel from '../components/AccountantPanel';
import AssetRegister from '../components/AssetRegister';
import StatementsPanel from '../components/StatementsPanel';
import { API, token } from '../lib/auth';
import { usePermissions } from '../lib/usePermissions';


type Tab = 'ledger-view' | 'ledgers' | 'journals' | 'trial-balance' | 'invoices' | 'fund-requests' | 'accounts' | 'docs' | 'tasks' | 'assets' | 'statements' | 'agent';

function Finance() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!token());
  const [tab, setTab] = useState<Tab>('ledger-view');
  const [showProfile, setShowProfile] = useState(false);
  const [showEntityForm, setShowEntityForm] = useState(false);
  const [showSecondaryForm, setShowSecondaryForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [data, setData] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);

  const [ledgers, setLedgers] = useState<any[]>([]);
  const [trialBalanceData, setTrialBalanceData] = useState<any>(null);
  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const day = today.getDate();
    let start: Date;
    if (day >= 15) {
      start = new Date(year, month, 15);
    } else {
      start = new Date(year, month - 1, 15);
    }
    const yyyy = start.getFullYear();
    const mm = String(start.getMonth() + 1).padStart(2, '0');
    const dd = String(start.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  const [endDate, setEndDate] = useState(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const day = today.getDate();
    let end: Date;
    if (day >= 15) {
      end = new Date(year, month + 1, 15);
    } else {
      end = new Date(year, month, 15);
    }
    const yyyy = end.getFullYear();
    const mm = String(end.getMonth() + 1).padStart(2, '0');
    const dd = String(end.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  const [selectedLedgerAccount, setSelectedLedgerAccount] = useState('');
  const [ledgerViewData, setLedgerViewData] = useState<any>(null);
  const [committees, setCommittees] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [fundRequests, setFundRequests] = useState<any[]>([]);
  const [showNestedForm, setShowNestedForm] = useState<string | null>(null); // key = which nested form to show

  // Granular Permissions
  // Grants come from the shared hook, which resolves them from the user's role.
  const { grants: userPermissions, loaded: permsLoaded } = usePermissions();

  const user = useMemo(() => JSON.parse(localStorage.getItem('ga_user') || '{}'), []);

  const getProfileUrl = (url: string) => {
    if (!url) return null;
    if (url.startsWith('http') || url.startsWith('/api')) return url;
    return `/api/assets/download/${url.startsWith('/') ? url.slice(1) : url}`;
  };


  const getPerm = (feature: string) => {
    if (user.isSuperadmin) return { canView: true, canEdit: true, canDelete: true };
    return userPermissions.find(p => p.appName === 'finance' && p.feature === feature) || {
      canView: false, canEdit: false, canDelete: false
    };
  };

  const handleLogout = () => {
    localStorage.clear();
    setIsAuthenticated(false);
  };

  const fetchData = () => {
    if (!permsLoaded) return;
    // DocumentsTab loads its own data from /finance/documents; the generic
    // `/finance/<tab>` fetch below would just 404 on /finance/docs.
    // Both render their own data; the generic finance fetch below does not apply.
    if (tab === 'docs' || tab === 'agent' || tab === 'assets' || tab === 'statements') { setLoading(false); return; }
    setLoading(true);
    let url = `${API}/finance/${tab}`;
    if (tab === 'journals') {
      url += `?startDate=${startDate}&endDate=${endDate}`;
    }
    if (tab === 'accounts') {
      url += `?startDate=${startDate}&endDate=${endDate}`;
    }
    if (tab === 'ledger-view' && selectedLedgerAccount) {
      url = `${API}/finance/ledger-view?account_id=${selectedLedgerAccount}&startDate=${startDate}&endDate=${endDate}`;
    }
    if (tab === 'trial-balance') {
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
        } else if (tab === 'ledger-view' && selectedLedgerAccount) {
          setLedgerViewData(d.data || null);
        } else {
          setData(d.data || []);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  const fetchRelations = () => {
    const fetchWithAuth = (url: string, setter: any) => {
      fetch(url, { headers: { Authorization: `Bearer ${token()}` } })
        .then(r => r.json()).then(d => setter(d.data || [])).catch(() => { });
    };
    fetchWithAuth(`${API}/finance/ledgers`, setLedgers);
    fetchWithAuth(`${API}/finance/accounts`, setAccounts);
    fetchWithAuth(`${API}/finance/invoices`, setInvoices);
    fetchWithAuth(`${API}/finance/fund-requests`, setFundRequests);
    fetchWithAuth(`${API}/core/committees`, setCommittees);
    fetchWithAuth(`${API}/core/clients`, setClients);
  };


  useEffect(() => {
    if (isAuthenticated && permsLoaded) {
      fetchData();
      fetchRelations();
    }
  }, [tab, isAuthenticated, permsLoaded, startDate, endDate, selectedLedgerAccount]);



  // Tab filtering
  const TABS = useMemo(() => {
    const all = [
      { id: 'ledger-view', label: 'Ledger Viewer', icon: FileText, feature: 'ledgers' },
      { id: 'ledgers', label: 'Ledgers', icon: Wallet, feature: 'ledgers' },
      { id: 'accounts', label: 'Accounts', icon: CreditCard, feature: 'accounts' },
      { id: 'journals', label: 'General Journal', icon: Receipt, feature: 'journals' },
      { id: 'trial-balance', label: 'Trial Balance', icon: FileText, feature: 'trial_balance' },
      { id: 'invoices', label: 'Invoices', icon: FileText, feature: 'invoices' },
      { id: 'fund-requests', label: 'Fund Requests', icon: ArrowUpRight, feature: 'fund_requests' },
      { id: 'docs', label: 'Documents', icon: Book, feature: 'docs' },
      { id: 'tasks', label: 'Tasks', icon: Receipt, feature: 'tasks' },
      { id: 'assets', label: 'Assets', icon: Package, feature: 'assets' },
      { id: 'statements', label: 'Statements', icon: FileText, feature: 'docs' },
      { id: 'agent', label: 'Accountant', icon: Calculator, feature: 'agent' },
    ] as const;

    if (user.isSuperadmin) return all;
    return all.filter(t => getPerm(t.feature).canView);
  }, [userPermissions, user.isSuperadmin]);

  useEffect(() => {
    if (permsLoaded && TABS.length > 0 && !TABS.find(t => t.id === tab)) {
      setTab(TABS[0].id);
    }
  }, [TABS, permsLoaded]);

  if (!isAuthenticated) return <Login onLogin={() => setIsAuthenticated(true)} />;
  if (!permsLoaded) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-12 h-12 text-emerald-400 animate-spin" /></div>;

  if (TABS.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="glass-panel p-12 rounded-[2.5rem] text-center space-y-6 max-w-md border border-white/10 shadow-2xl">
          <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto border border-emerald-500/20">
            <Lock className="w-10 h-10 text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Finance Restricted</h2>
          <p className="text-textSecondary text-sm leading-relaxed">
            Financial ledger access requires explicit CRUD provisioning.
            Please contact the Controller to request feature permissions.
          </p>
          <button onClick={() => window.location.href = '/'} className="px-8 py-3 bg-white/5 hover:bg-white/10 rounded-full font-bold text-sm transition-all border border-white/10">
            Return Home
          </button>
        </div>
      </div>
    );
  }

  const handleEntitySubmit = async (formData: any) => {
    const method = editingRecord ? 'PATCH' : 'POST';
    const url = editingRecord ? `${API}/finance/${tab}/${editingRecord.id}` : `${API}/finance/${tab}`;
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify(formData),
    });
    if (res.status === 401) { handleLogout(); return; }
    if (!res.ok) throw new Error(`Failed to save ${tab}`);
    setShowEntityForm(false);
    setEditingRecord(null);
    fetchData();
  };

  const currentFeature = TABS.find(t => t.id === tab)?.feature || 'ledgers';
  const p = getPerm(currentFeature);

  return (
    <div className="min-h-screen flex flex-col bg-background font-sans text-textPrimary animate-in fade-in duration-700">
      <header className="glass-panel sticky top-0 z-50 px-4 py-3 md:px-8 md:py-4 flex items-center justify-between border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-500/20 p-2 rounded-xl border border-emerald-500/20 shadow-lg shadow-emerald-500/5">
            <Wallet className="w-5 h-5 md:w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-black tracking-tighter leading-none"><span className="text-emerald-400">FINANCE</span></h1>
            <span className="text-[8px] md:text-[10px] uppercase tracking-[0.2em] text-textSecondary font-black leading-none">Global Controllership</span>
          </div>
          <button onClick={() => window.location.href = '/'} className="ml-1 md:ml-2 p-2 text-textSecondary hover:text-emerald-400 hover:bg-emerald-400/10 rounded-xl transition-all">
            <Home className="w-4 h-4 md:w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          <button onClick={() => setShowProfile(true)} className="flex items-center gap-2 md:gap-3 pl-2 pr-2 md:pr-4 py-1 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all group">
            <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center font-bold text-[10px] md:text-xs shadow-lg shadow-emerald-500/20 overflow-hidden">
              {user.profilePhoto ? (
                <img src={getProfileUrl(user.profilePhoto)!} alt="User" className="w-full h-full object-cover" />
              ) : (
                user.name?.charAt(0) || user.email?.charAt(0).toUpperCase()
              )}
            </div>
            <div className="text-left hidden sm:block">
              <div className="text-xs font-black leading-none mb-0.5">{user.name || user.username || 'Finance'}</div>
              <div className="text-[10px] text-textSecondary leading-none uppercase tracking-widest font-black">{user.title || 'Controller'}</div>
            </div>
          </button>
          <div className="h-6 md:h-8 w-px bg-white/10 mx-1" />
          <button onClick={handleLogout} className="p-2 md:p-2.5 text-textSecondary hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all">
            <LogOut className="w-4 h-4 md:w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="hidden md:block border-b border-white/5 bg-surface/30 backdrop-blur-md px-4 md:px-8 overflow-x-auto no-scrollbar">
        <div className="flex gap-1 md:gap-2 max-w-7xl mx-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 md:px-6 py-4 md:py-5 text-[9px] md:text-[11px] font-black border-b-2 transition-all uppercase tracking-widest whitespace-nowrap ${tab === t.id
                ? 'border-emerald-400 text-emerald-400 bg-emerald-400/5'
                : 'border-transparent text-textSecondary hover:text-textPrimary hover:bg-white/5'
                }`}>
              <t.icon className={`w-3 h-3 md:w-3.5 md:h-3.5 ${tab === t.id ? 'text-emerald-400' : 'text-textSecondary'}`} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full space-y-6 md:space-y-8 animate-in slide-in-from-bottom-2 duration-500">
        <MobileTabMenu
          tabs={TABS.map(t => ({ id: t.id, label: t.label, icon: t.icon }))}
          activeTab={tab}
          onTabChange={(id) => setTab(id as Tab)}
          accentColor="emerald-400"
        />
        {tab === 'ledger-view' && (
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
                        <div key={d.id} className={`flex justify-between items-center text-sm py-3 px-4 rounded-xl border transition-all group ${d.isBalanceEntry ? 'bg-amber-500/10 border-amber-500/30' : 'hover:bg-white/5 border-transparent hover:border-white/10'}`}>
                          <div className="flex flex-col gap-0.5">
                            <span className={`font-bold transition-colors ${d.isBalanceEntry ? 'text-amber-400' : 'text-white group-hover:text-emerald-400'}`}>{d.description || 'Entry'}</span>
                            <span className="text-[10px] text-textSecondary font-mono">{new Date(d.entryDate).toLocaleDateString()}</span>
                            {!d.isBalanceEntry && d.id && <span className="text-[10px] font-mono text-emerald-500/60 bg-emerald-500/5 border border-emerald-500/10 px-1.5 py-0.5 rounded self-start">{d.id}</span>}
                          </div>
                          <span className={`font-mono font-black ${d.isBalanceEntry ? 'text-amber-400' : 'text-emerald-400'}`}>${(d.amount || 0).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="font-black text-lg mb-4 text-rose-400 border-b border-white/10 pb-2 tracking-widest uppercase">Credit (Cr)</h3>
                    <div className="space-y-2">
                      {ledgerViewData.credits.map((c: any) => (
                        <div key={c.id} className={`flex justify-between items-center text-sm py-3 px-4 rounded-xl border transition-all group ${c.isBalanceEntry ? 'bg-amber-500/10 border-amber-500/30' : 'hover:bg-white/5 border-transparent hover:border-white/10'}`}>
                          <div className="flex flex-col gap-0.5">
                            <span className={`font-bold transition-colors ${c.isBalanceEntry ? 'text-amber-400' : 'text-white group-hover:text-rose-400'}`}>{c.description || 'Entry'}</span>
                            <span className="text-[10px] text-textSecondary font-mono">{new Date(c.entryDate).toLocaleDateString()}</span>
                            {!c.isBalanceEntry && c.id && <span className="text-[10px] font-mono text-rose-500/60 bg-rose-500/5 border border-rose-500/10 px-1.5 py-0.5 rounded self-start">{c.id}</span>}
                          </div>
                          <span className={`font-mono font-black ${c.isBalanceEntry ? 'text-amber-400' : 'text-rose-400'}`}>${(c.amount || 0).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                
                <div className="mt-8 pt-6 border-t-2 border-white/20 grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                  <div className="flex justify-between font-black text-lg px-4 border-b-2 border-white/20 pb-2">
                    <span>Total Dr</span>
                    <span className="text-emerald-400 font-mono">${(ledgerViewData.totalDebit || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between font-black text-lg px-4 border-b-2 border-white/20 pb-2">
                    <span>Total Cr</span>
                    <span className="text-rose-400 font-mono">${(ledgerViewData.totalCredit || 0).toLocaleString()}</span>
                  </div>
                </div>
                
                <div className="mt-8 flex justify-center relative z-10">
                  <div className={`px-8 py-4 rounded-2xl border-2 font-black text-xl flex gap-4 items-center shadow-2xl ${ledgerViewData.balanceSide === 'debit' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-emerald-500/20' : 'bg-rose-500/10 border-rose-500/30 text-rose-400 shadow-rose-500/20'}`}>
                    <span>Balance b/d:</span>
                    <span className="font-mono">${(ledgerViewData.closingBalance || 0).toLocaleString()}</span>
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

        {/* Tabs that render their own surface. The generic grid below is for
            record lists; drawing it for these produced an empty accounts table,
            a "0 agens available" count and an "Add agen" button above the
            accountant, because the header is derived from the tab id. */}
        {tab !== 'tasks' && tab !== 'trial-balance' && tab !== 'ledger-view' && tab !== 'docs' && tab !== 'agent' && tab !== 'assets' && tab !== 'statements' && (
          <div className="space-y-4">
            {tab === 'journals' && (
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
          <GAGrid
            title={TABS.find(t => t.id === tab)?.label || 'Finance'}
            entityName={tab.slice(0, -1)}
            columns={
              tab === 'ledgers' ? [
                { key: 'ledgerName', label: 'Ledger Name' },
                { key: 'description', label: 'Description' },
                { key: 'createdAt', label: 'Created At', type: 'date' as const },
              ] : tab === 'journals' ? [
                { key: 'id', label: '#', render: (v: any) => <span className="font-mono text-[10px] text-textSecondary bg-white/5 border border-white/10 px-2 py-0.5 rounded-lg">{v}</span> },
                { key: 'entryDate', label: 'Date', type: 'date' as const },
                { key: 'description', label: 'Description' },
                { key: 'amount', label: 'Amount', render: (v: any, row: any) => {
                    let lines = [];
                    if (row.lines) {
                      try { lines = typeof row.lines === 'string' ? JSON.parse(row.lines) : row.lines; } catch { /* non-fatal: leave prior state */ }
                    }
                    if (lines.length > 0) {
                      const total = lines.filter((l: any) => l.type === 'debit').reduce((acc: number, l: any) => acc + (l.amount || 0), 0);
                      return <span className="font-mono">${total.toLocaleString()}</span>;
                    }
                    return <span className="font-mono">${(v || 0).toLocaleString()}</span>;
                  }
                },
                { key: 'debitAccountId', label: 'Debit Account', render: (v: any, row: any) => {
                    let lines = [];
                    if (row.lines) {
                      try { lines = typeof row.lines === 'string' ? JSON.parse(row.lines) : row.lines; } catch { /* non-fatal: leave prior state */ }
                    }
                    if (lines.length > 0) {
                      const drs = lines.filter((l: any) => l.type === 'debit');
                      return drs.length > 1 ? <span className="text-emerald-400/70 italic text-xs">Multiple ({drs.length})</span> : (accounts.find(a => a.id === drs[0]?.accountId)?.accountName || '—');
                    }
                    return accounts.find(a => a.id === v)?.accountName || v || '—';
                  }
                },
                { key: 'creditAccountId', label: 'Credit Account', render: (v: any, row: any) => {
                    let lines = [];
                    if (row.lines) {
                      try { lines = typeof row.lines === 'string' ? JSON.parse(row.lines) : row.lines; } catch { /* non-fatal: leave prior state */ }
                    }
                    if (lines.length > 0) {
                      const crs = lines.filter((l: any) => l.type === 'credit');
                      return crs.length > 1 ? <span className="text-rose-400/70 italic text-xs">Multiple ({crs.length})</span> : (accounts.find(a => a.id === crs[0]?.accountId)?.accountName || '—');
                    }
                    return accounts.find(a => a.id === v)?.accountName || v || '—';
                  }
                },
                { key: 'invoiceId', label: 'Invoice', render: (v: any) => { const inv = invoices.find((i) => i.id === v); return inv ? <span className="text-xs font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg">{inv.invoiceNumber}</span> : <span className="text-textSecondary text-xs">—</span>; } },
              ] : tab === 'invoices' ? [
                { key: 'invoiceNumber', label: 'Invoice #' },
                { key: 'vendorName', label: 'Vendor' },
                { key: 'type', label: 'Type', type: 'badge' as const },
                { key: 'amount', label: 'Total', type: 'currency' as const },
                { key: 'status', label: 'Status', type: 'status' as const },
                { key: 'issueDate', label: 'Issued', type: 'date' as const },
                { key: 'dueDate', label: 'Due Date', type: 'date' as const },
              ] : tab === 'fund-requests' ? [
                { key: 'requestName', label: 'Request' },
                { key: 'amountRequested', label: 'Amount', type: 'currency' as const },
                { key: 'purpose', label: 'Purpose' },
                { key: 'approvalStatus', label: 'Approval', type: 'status' as const },
                { key: 'disbursementStatus', label: 'Disbursement', type: 'badge' as const },
                { key: 'requestDate', label: 'Date', type: 'date' as const },
              ] : [
                { key: 'accountName', label: 'Account', type: 'avatar' as const },
                { key: 'accountType', label: 'Type', type: 'badge' as const },
                { key: 'bankName', label: 'Bank' },
                { key: 'openingBalance', label: 'Opening Bal.', render: (v: any, row: any) => <span className="font-mono text-sm">${Number(v || 0).toLocaleString()} <span className={row.openingBalanceSide === 'debit' ? 'text-emerald-400 font-bold' : row.openingBalanceSide === 'credit' ? 'text-rose-400 font-bold' : 'text-textSecondary'}>{row.openingBalanceSide === 'debit' ? 'Dr' : row.openingBalanceSide === 'credit' ? 'Cr' : '—'}</span></span> },
                { key: 'closingBalance', label: 'Closing Bal.', render: (v: any, row: any) => <span className="font-mono text-sm">${Number(v || 0).toLocaleString()} <span className={row.closingBalanceSide === 'debit' ? 'text-emerald-400 font-bold' : row.closingBalanceSide === 'credit' ? 'text-rose-400 font-bold' : 'text-textSecondary'}>{row.closingBalanceSide === 'debit' ? 'Dr' : row.closingBalanceSide === 'credit' ? 'Cr' : '—'}</span></span> },
                { key: 'currency', label: 'Currency' },
                { key: 'status', label: 'Status', type: 'status' as const },
              ]
            }
            data={data}
            loading={loading}
            onAdd={() => { setEditingRecord(null); setShowEntityForm(true); }}
            onEdit={(r) => { setEditingRecord(r); setShowEntityForm(true); }}
            onDelete={async (r) => {
              if (!confirm(`Delete this record? This cannot be undone.`)) return;
              const res = await fetch(`${API}/finance/${tab}/${r.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
              if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                alert(body.error || `Failed to delete. Please check dependencies and try again.`);
                return;
              }
              fetchData();
            }}
            canAdd={p.canEdit}
            canEdit={p.canEdit}
            canDelete={p.canDelete}
          />
          </div>
        )}
        {tab === 'trial-balance' && trialBalanceData && (
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4 items-end glass-panel p-4 rounded-2xl border border-white/10">
              <div className="flex-1 w-full md:w-auto">
                <label className="text-xs text-textSecondary mb-1 block">Start Date</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm text-white" />
              </div>
              <div className="flex-1 w-full md:w-auto">
                <label className="text-xs text-textSecondary mb-1 block">End Date</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm text-white" />
              </div>
            </div>
            
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
          </div>
        )}
        {tab === 'docs' && (
          <DocumentsTab
            endpoint="/finance/documents"
            uploadPrefix="finance-docs"
            heading="Finance Documents"
            description="Statements, audit reports, tax filings, and supporting records."
            documentTypes={['Statement', 'Audit Report', 'Tax Filing', 'Invoice Record', 'Bank Record', 'Contract', 'Other']}
            accentClass="text-emerald-400"
            canEdit={getPerm('docs').canEdit}
            canDelete={getPerm('docs').canDelete}
          />
        )}
        {tab === 'tasks' && <TaskBoard department="Finance" canEdit={getPerm('tasks').canEdit} />}

        {tab === 'statements' && (
          <StatementsPanel canEdit={user.isSuperadmin || getPerm('docs').canEdit} />
        )}

        {tab === 'assets' && (
          <AssetRegister
            canEdit={user.isSuperadmin || getPerm('assets').canEdit}
            canDelete={user.isSuperadmin || getPerm('assets').canDelete}
          />
        )}

        {tab === 'agent' && (
          <AccountantPanel
            canDrive={user.isSuperadmin || getPerm('agent').canEdit}
            canEditConfig={user.isSuperadmin || getPerm('agent_config').canEdit}
          />
        )}
      </main>



      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
      <NotificationCenter currentApp="finance" />

      {showEntityForm && tab === 'journals' ? (
        <JournalEntryForm
          initialData={editingRecord}
          accounts={accounts}
          invoices={invoices}
          onClose={() => { setShowEntityForm(false); setEditingRecord(null); }}
          onSubmit={handleEntitySubmit}
        />
      ) : showEntityForm && (
        <EntityForm
          title={editingRecord ? `Update ${TABS.find(t => t.id === tab)?.label || tab}` : `New ${TABS.find(t => t.id === tab)?.label || tab}`}
          fields={
            tab === 'ledgers' ? [
              { key: 'ledgerName', label: 'Ledger Name', type: 'text' as const, required: true },
              { key: 'description', label: 'Description', type: 'textarea' as const },
            ] : tab === 'invoices' ? [
              { key: 'invoiceNumber', label: 'Invoice Number', type: 'text' as const, required: true },
              {
                key: 'type', label: 'Invoice Type', type: 'select' as const, options: [
                  { value: 'standard', label: 'Standard' }, { value: 'proforma', label: 'Pro Forma' },
                  { value: 'credit_note', label: 'Credit Note' }, { value: 'debit_note', label: 'Debit Note' },
                ]
              },
              { key: 'vendorName', label: 'Vendor / Billed To', type: 'text' as const },
              { key: 'description', label: 'Description', type: 'textarea' as const },
              { key: 'amount', label: 'Total Amount ($)', type: 'number' as const, required: true },
              { key: 'issueDate', label: 'Issue Date', type: 'date' as const },
              { key: 'dueDate', label: 'Due Date', type: 'date' as const },
              {
                key: 'status', label: 'Status', type: 'select' as const, options: [
                  { value: 'draft', label: 'Draft' }, { value: 'pending', label: 'Pending' },
                  { value: 'paid', label: 'Paid' }, { value: 'overdue', label: 'Overdue' }, { value: 'cancelled', label: 'Cancelled' },
                ], required: true
              },
              { key: 'clientId', label: 'Client', type: 'select' as const, options: clients.map(c => ({ value: c.id, label: c.clientName })) },
              { key: 'committeeId', label: 'Committee', type: 'select' as const, options: committees.map(c => ({ value: c.id, label: c.committeeName })) },
              { key: 'fundRequestId', label: 'Fund Request', type: 'select' as const, options: fundRequests.map(f => ({ value: f.id, label: f.requestName })), action: { label: '+ New Request', onClick: () => setShowNestedForm('fund-request') } },
              { key: 'invoiceDoc', label: 'Invoice Document', type: 'file' as const, pathPrefix: 'finance-docs' },
            ] : tab === 'fund-requests' ? [
              { key: 'requestName', label: 'Request Name', type: 'text' as const, required: true },
              { key: 'requestDate', label: 'Request Date', type: 'date' as const },
              { key: 'amountRequested', label: 'Amount Requested ($)', type: 'number' as const, required: true },
              { key: 'purpose', label: 'Detailed Purpose', type: 'textarea' as const },
              {
                key: 'approvalStatus', label: 'Approval Status', type: 'select' as const, options: [
                  { value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' },
                  { value: 'rejected', label: 'Rejected' }, { value: 'on_hold', label: 'On Hold' },
                ]
              },
              { key: 'approvedBy', label: 'Approved By', type: 'text' as const },
              { key: 'approvalDate', label: 'Approval Date', type: 'date' as const },
              {
                key: 'disbursementStatus', label: 'Disbursement Status', type: 'select' as const, options: [
                  { value: 'pending', label: 'Pending' }, { value: 'partial', label: 'Partial' },
                  { value: 'disbursed', label: 'Disbursed' }, { value: 'cancelled', label: 'Cancelled' },
                ]
              },
              { key: 'disbursementDate', label: 'Disbursement Date', type: 'date' as const },
              { key: 'committeeId', label: 'Associated Committee', type: 'select' as const, options: committees.map(c => ({ value: c.id, label: c.committeeName })) },
            ] : tab === 'accounts' ? [
              { key: 'ledgerId', label: 'Linked Ledger', type: 'select' as const, options: ledgers.map(l => ({ value: l.id, label: l.ledgerName })) },
              { key: 'accountName', label: 'Account Name', type: 'text' as const, required: true },
              {
                key: 'accountType', label: 'Account Type', type: 'select' as const, options: [
                  { value: 'asset', label: 'Asset (Dr Normal)' },
                  { value: 'liability', label: 'Liability (Cr Normal)' },
                  { value: 'equity', label: 'Equity (Cr Normal)' },
                  { value: 'revenue', label: 'Revenue (Cr Normal)' },
                  { value: 'expense', label: 'Expense (Dr Normal)' },
                ]
              },
              { key: 'bankName', label: 'Bank Name', type: 'text' as const },
              { key: 'accountNumber', label: 'Account Number', type: 'text' as const },

              {
                key: 'currency', label: 'Currency', type: 'select' as const, options: [
                  { value: 'USD', label: 'USD' }, { value: 'EUR', label: 'EUR' },
                  { value: 'GBP', label: 'GBP' }, { value: 'AED', label: 'AED' }, { value: 'INR', label: 'INR' },
                ]
              },
              {
                key: 'status', label: 'Status', type: 'select' as const, options: [
                  { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'closed', label: 'Closed' },
                ]
              },
            ] : []
          }
          initialData={editingRecord}
          onClose={() => { setShowEntityForm(false); setEditingRecord(null); }}
          onSubmit={handleEntitySubmit}
        />
      )}

      {showSecondaryForm && (
        <EntityForm
          title="New Invoice"
          fields={[
            { key: 'invoiceNumber', label: 'Invoice #', type: 'text', required: true },
            { key: 'clientId', label: 'Client', type: 'select', options: clients.map(c => ({ value: c.id, label: c.clientName })) },
            { key: 'amount', label: 'Total Amount', type: 'number', required: true },
            { key: 'status', label: 'Status', type: 'select', options: [{ value: 'pending', label: 'Pending' }, { value: 'paid', label: 'Paid' }], required: true },
            { key: 'invoiceDoc', label: 'Invoice Document', type: 'file', pathPrefix: 'finance-docs' },
          ]}
          onClose={() => setShowSecondaryForm(false)}
          onSubmit={async (formData) => {
            const res = await fetch(`${API}/finance/invoices`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
              body: JSON.stringify(formData),
            });
            if (!res.ok) throw new Error('Failed to create invoice');
            fetchData();
            fetchRelations(); // Refresh invoices list
            setShowSecondaryForm(false);
          }}
        />
      )}

      {showNestedForm === 'account' && (
        <EntityForm
          title="New Account"
          fields={[
            { key: 'ledgerId', label: 'Linked Ledger', type: 'select' as const, options: ledgers.map(l => ({ value: l.id, label: l.ledgerName })) },
            { key: 'accountName', label: 'Account Name', type: 'text' as const, required: true },
            {
              key: 'accountType', label: 'Account Type', type: 'select' as const, options: [
                { value: 'asset', label: 'Asset (Dr Normal)' },
                { value: 'liability', label: 'Liability (Cr Normal)' },
                { value: 'equity', label: 'Equity (Cr Normal)' },
                { value: 'revenue', label: 'Revenue (Cr Normal)' },
                { value: 'expense', label: 'Expense (Dr Normal)' },
              ]
            },
            { key: 'bankName', label: 'Bank Name', type: 'text' as const },
            { key: 'accountNumber', label: 'Account Number', type: 'text' as const },

            {
              key: 'currency', label: 'Currency', type: 'select' as const, options: [
                { value: 'USD', label: 'USD' }, { value: 'EUR', label: 'EUR' }, { value: 'GBP', label: 'GBP' },
                { value: 'AED', label: 'AED' }, { value: 'INR', label: 'INR' },
              ]
            },
            {
              key: 'status', label: 'Status', type: 'select' as const, options: [
                { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' },
              ]
            },
          ]}
          onClose={() => setShowNestedForm(null)}
          onSubmit={async (formData) => {
            const res = await fetch(`${API}/finance/accounts`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
              body: JSON.stringify(formData),
            });
            if (!res.ok) throw new Error('Failed to create account');
            fetchRelations();
            setShowNestedForm(null);
          }}
        />
      )}



      {showNestedForm === 'fund-request' && (
        <EntityForm
          title="New Fund Request"
          fields={[
            { key: 'requestName', label: 'Request Name', type: 'text' as const, required: true },
            { key: 'amountRequested', label: 'Amount ($)', type: 'number' as const, required: true },
            { key: 'purpose', label: 'Purpose', type: 'textarea' as const },
            {
              key: 'approvalStatus', label: 'Status', type: 'select' as const, options: [
                { value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' },
              ]
            },
            { key: 'committeeId', label: 'Committee', type: 'select' as const, options: committees.map(c => ({ value: c.id, label: c.committeeName })) },
          ]}
          onClose={() => setShowNestedForm(null)}
          onSubmit={async (formData) => {
            const res = await fetch(`${API}/finance/fund-requests`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
              body: JSON.stringify(formData),
            });
            if (!res.ok) throw new Error('Failed to create fund request');
            fetchRelations();
            setShowNestedForm(null);
          }}
        />
      )}
    </div>
  );
}

export default Finance;
