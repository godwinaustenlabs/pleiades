import { useState, useEffect, useMemo } from 'react';
import {
  Wallet, Receipt, CreditCard, ArrowUpRight, LogOut,
  Settings, FileText, Home, Loader2, Lock
} from 'lucide-react';
import Login from './Login';
import GanovaGrid from '../components/GanovaGrid';
import EntityForm from '../components/EntityForm';
import ProfileModal from '../components/ProfileModal';
import TaskBoard from '../components/TaskBoard';

const API = '/api';
const token = () => localStorage.getItem('ganova_token') || '';

type Tab = 'transactions' | 'invoices' | 'fund-requests' | 'accounts' | 'tasks';

interface UserPermission {
  appName: string;
  feature: string;
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

function Finance() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!token());
  const [tab, setTab] = useState<Tab>('transactions');
  const [showProfile, setShowProfile] = useState(false);
  const [showEntityForm, setShowEntityForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [committees, setCommittees] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);

  // Granular Permissions
  const [userPermissions, setUserPermissions] = useState<UserPermission[]>([]);
  const [permsLoaded, setPermsLoaded] = useState(false);

  const user = useMemo(() => JSON.parse(localStorage.getItem('ganova_user') || '{}'), []);

  const fetchPermissions = async () => {
    try {
      const res = await fetch(`${API}/permissions/user/${user.id}`, { headers: { Authorization: `Bearer ${token()}` } });
      const d = await res.json();
      setUserPermissions(d.data || []);
      setPermsLoaded(true);
    } catch (err) {
      setPermsLoaded(true);
    }
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
    setLoading(true);
    fetch(`${API}/finance/${tab}`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => {
        if (r.status === 401) { handleLogout(); throw new Error('Unauthorized'); }
        return r.json();
      })
      .then(d => { setData(d.data || []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  const fetchRelations = () => {
    const fetchWithAuth = (url: string, setter: any) => {
      fetch(url, { headers: { Authorization: `Bearer ${token()}` } })
        .then(r => r.json()).then(d => setter(d.data || [])).catch(()=>{});
    };
    fetchWithAuth(`${API}/finance/accounts`, setAccounts);
    fetchWithAuth(`${API}/finance/channels`, setChannels);
    fetchWithAuth(`${API}/core/employees`, setEmployees);
    fetchWithAuth(`${API}/core/committees`, setCommittees);
    fetchWithAuth(`${API}/core/clients`, setClients);
  };

  useEffect(() => {
    if (isAuthenticated) fetchPermissions();
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && permsLoaded) {
      fetchData();
      fetchRelations();
    }
  }, [tab, isAuthenticated, permsLoaded]);



  // Tab filtering
  const TABS = useMemo(() => {
    const all = [
      { id: 'transactions', label: 'Ledger', icon: Receipt, feature: 'transactions' },
      { id: 'invoices', label: 'Invoices', icon: FileText, feature: 'invoices' },
      { id: 'fund-requests', label: 'Fund Requests', icon: ArrowUpRight, feature: 'fund_requests' },
      { id: 'accounts', label: 'Accounts', icon: CreditCard, feature: 'accounts' },
      { id: 'tasks', label: 'Tasks', icon: Receipt, feature: 'tasks' },
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

  const currentFeature = TABS.find(t => t.id === tab)?.feature || 'transactions';
  const p = getPerm(currentFeature);

  return (
    <div className="min-h-screen flex flex-col bg-background font-sans text-textPrimary animate-in fade-in duration-700">
      <header className="glass-panel sticky top-0 z-50 px-8 py-4 flex items-center justify-between border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-500/20 p-2 rounded-xl border border-emerald-500/20 shadow-lg shadow-emerald-500/5">
            <Wallet className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tighter leading-none">GAnova<span className="text-emerald-400">FINANCE</span></h1>
            <span className="text-[10px] uppercase tracking-[0.2em] text-textSecondary font-black leading-none">Global Controllership</span>
          </div>
          <button onClick={() => window.location.href = '/'} className="ml-2 p-2 text-textSecondary hover:text-emerald-400 hover:bg-emerald-400/10 rounded-xl transition-all">
            <Home className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-4">
          <button onClick={() => setShowProfile(true)} className="flex items-center gap-3 pl-2 pr-4 py-1.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all group">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center font-bold text-xs shadow-lg shadow-emerald-500/20">
              {user.name?.charAt(0) || user.email?.charAt(0).toUpperCase()}
            </div>
            <div className="text-left hidden sm:block">
              <div className="text-xs font-black leading-none mb-0.5">{user.name || user.username || 'Finance'}</div>
              <div className="text-[10px] text-textSecondary leading-none uppercase tracking-widest font-black">{user.roleName || 'Controller'}</div>
            </div>
            <Settings className="w-3.5 h-3.5 text-textSecondary group-hover:rotate-90 transition-transform duration-500" />
          </button>
          <div className="h-8 w-px bg-white/10 mx-1" />
          <button onClick={handleLogout} className="p-2.5 text-textSecondary hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="border-b border-white/5 bg-surface/30 backdrop-blur-md px-8 overflow-x-auto no-scrollbar">
        <div className="flex gap-2 max-w-7xl mx-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-6 py-5 text-[11px] font-black border-b-2 transition-all uppercase tracking-widest whitespace-nowrap ${tab === t.id
                  ? 'border-emerald-400 text-emerald-400 bg-emerald-400/5'
                  : 'border-transparent text-textSecondary hover:text-textPrimary hover:bg-white/5'
                }`}>
              <t.icon className={`w-3.5 h-3.5 ${tab === t.id ? 'text-emerald-400' : 'text-textSecondary'}`} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 p-8 max-w-7xl mx-auto w-full space-y-8 animate-in slide-in-from-bottom-2 duration-500">
        {tab !== 'tasks' && (
          <GanovaGrid
            title={TABS.find(t => t.id === tab)?.label || 'Finance'}
            entityName={tab.slice(0, -1)}
            columns={
              tab === 'transactions' ? [
                { key: 'description', label: 'Description' },
                { key: 'amount', label: 'Amount', type: 'currency' },
                { key: 'transactionType', label: 'Type', type: 'badge' },
                { key: 'transactionDate', label: 'Date', type: 'date' },
              ] : tab === 'invoices' ? [
                { key: 'invoiceNumber', label: 'Invoice #' },
                { key: 'amount', label: 'Total', type: 'currency' },
                { key: 'status', label: 'Status', type: 'status' },
                { key: 'dueDate', label: 'Due Date', type: 'date' },
              ] : tab === 'fund-requests' ? [
                { key: 'requestName', label: 'Request' },
                { key: 'amountRequested', label: 'Amount', type: 'currency' },
                { key: 'approvalStatus', label: 'Status', type: 'status' },
              ] : [
                { key: 'accountName', label: 'Account', type: 'avatar' },
                { key: 'currentBalance', label: 'Balance', type: 'currency' },
                { key: 'status', label: 'Status', type: 'status' },
              ]
            }
            data={data}
            loading={loading}
            onAdd={() => { setEditingRecord(null); setShowEntityForm(true); }}
            onEdit={(r) => { setEditingRecord(r); setShowEntityForm(true); }}
            onDelete={async (r) => {
              if (!confirm(`Irreversible deletion of financial record. Confirm?`)) return;
              await fetch(`${API}/finance/${tab}/${r.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
              fetchData();
            }}
            canAdd={p.canEdit}
            canEdit={p.canEdit}
            canDelete={p.canDelete}
          />
        )}
        {tab === 'tasks' && <TaskBoard department="Finance" canEdit={getPerm('tasks').canEdit} />}
      </main>

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}

      {showEntityForm && (
        <EntityForm
          title={editingRecord ? `Update ${tab.slice(0, -1)}` : `New ${tab.slice(0, -1)}`}
          fields={
            tab === 'transactions' ? [
              { key: 'description', label: 'Description', type: 'textarea', required: true },
              { key: 'amount', label: 'Amount', type: 'number', required: true },
              { key: 'transactionType', label: 'Type', type: 'select', options: [{ value: 'income', label: 'Income' }, { value: 'expense', label: 'Expense' }], required: true },
              { key: 'transactionDate', label: 'Date', type: 'date' },
              { key: 'accountId', label: 'Account', type: 'select', options: accounts.map(a => ({ value: a.id, label: a.accountName })) },
              { key: 'channelId', label: 'Channel', type: 'select', options: channels.map(c => ({ value: c.id, label: c.channelName })) },
              { key: 'category', label: 'Category', type: 'text' },
              { key: 'vendorName', label: 'Vendor/Payee', type: 'text' },
              { key: 'status', label: 'Status', type: 'select', options: [{ value: 'pending', label: 'Pending' }, { value: 'cleared', label: 'Cleared' }, { value: 'failed', label: 'Failed' }] },
            ] : tab === 'invoices' ? [
              { key: 'invoiceNumber', label: 'Invoice #', type: 'text', required: true },
              { key: 'clientId', label: 'Client', type: 'select', options: clients.map(c => ({ value: c.id, label: c.clientName })) },
              { key: 'committeeId', label: 'Committee', type: 'select', options: committees.map(c => ({ value: c.id, label: c.committeeName })) },
              { key: 'amount', label: 'Total Amount', type: 'number', required: true },
              { key: 'taxAmount', label: 'Tax Amount', type: 'number' },
              { key: 'issueDate', label: 'Issue Date', type: 'date' },
              { key: 'dueDate', label: 'Due Date', type: 'date' },
              { key: 'status', label: 'Status', type: 'select', options: [{ value: 'pending', label: 'Pending' }, { value: 'paid', label: 'Paid' }, { value: 'overdue', label: 'Overdue' }, { value: 'cancelled', label: 'Cancelled' }], required: true },
              { key: 'invoiceDoc', label: 'Invoice Document', type: 'file' },
            ] : tab === 'fund-requests' ? [
              { key: 'requestName', label: 'Request Name', type: 'text', required: true },
              { key: 'requestedById', label: 'Requested By', type: 'select', options: employees.map(e => ({ value: e.id, label: e.name })) },
              { key: 'committeeId', label: 'Associated Committee', type: 'select', options: committees.map(c => ({ value: c.id, label: c.committeeName })) },
              { key: 'amountRequested', label: 'Amount', type: 'number', required: true },
              { key: 'purpose', label: 'Detailed Purpose', type: 'textarea' },
              { key: 'approvalStatus', label: 'Status', type: 'select', options: [{ value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }] },
              { key: 'approvedById', label: 'Approved By', type: 'select', options: employees.map(e => ({ value: e.id, label: e.name })) },
              { key: 'approvalDate', label: 'Approval Date', type: 'date' },
              { key: 'disbursementDate', label: 'Disbursement Date', type: 'date' },
            ] : [
              { key: 'accountName', label: 'Account Name', type: 'text', required: true },
              { key: 'accountType', label: 'Account Type', type: 'text' },
              { key: 'accountNumber', label: 'Account Number', type: 'text' },
              { key: 'bankName', label: 'Bank Name', type: 'text' },
              { key: 'currentBalance', label: 'Balance', type: 'number', required: true },
              { key: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }, { value: 'frozen', label: 'Frozen' }, { value: 'closed', label: 'Closed' }] },
            ]
          }
          initialData={editingRecord}
          onClose={() => { setShowEntityForm(false); setEditingRecord(null); }}
          onSubmit={handleEntitySubmit}
        />
      )}
    </div>
  );
}

export default Finance;
