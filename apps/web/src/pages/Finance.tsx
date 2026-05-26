import { useState, useEffect, useMemo } from 'react';
import {
  Wallet, Receipt, CreditCard, ArrowUpRight, LogOut,
  FileText, Home, Loader2, Lock
} from 'lucide-react';
import Login from './Login';
import GAGrid from '../components/GAGrid';
import EntityForm from '../components/EntityForm';
import ProfileModal from '../components/ProfileModal';
import TaskBoard from '../components/TaskBoard';
import NotificationCenter from '../components/NotificationCenter';
import MobileTabMenu from '../components/MobileTabMenu';

const API = '/api';
const token = () => localStorage.getItem('ga_token') || '';

type Tab = 'transactions' | 'invoices' | 'fund-requests' | 'accounts' | 'channels' | 'tasks';

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
  const [showSecondaryForm, setShowSecondaryForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [data, setData] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [committees, setCommittees] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [fundRequests, setFundRequests] = useState<any[]>([]);
  const [showNestedForm, setShowNestedForm] = useState<string | null>(null); // key = which nested form to show

  // Granular Permissions
  const [userPermissions, setUserPermissions] = useState<UserPermission[]>([]);
  const [permsLoaded, setPermsLoaded] = useState(false);

  const user = useMemo(() => JSON.parse(localStorage.getItem('ga_user') || '{}'), []);

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
        .then(r => r.json()).then(d => setter(d.data || [])).catch(() => { });
    };
    fetchWithAuth(`${API}/finance/accounts`, setAccounts);
    fetchWithAuth(`${API}/finance/channels`, setChannels);
    fetchWithAuth(`${API}/finance/invoices`, setInvoices);
    fetchWithAuth(`${API}/finance/fund-requests`, setFundRequests);
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
      { id: 'channels', label: 'Channels', icon: Wallet, feature: 'channels' },
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
                <img src={user.profilePhoto} alt="User" className="w-full h-full object-cover" />
              ) : (
                user.name?.charAt(0) || user.email?.charAt(0).toUpperCase()
              )}
            </div>
            <div className="text-left hidden sm:block">
              <div className="text-xs font-black leading-none mb-0.5">{user.name || user.username || 'Finance'}</div>
              <div className="text-[10px] text-textSecondary leading-none uppercase tracking-widest font-black">{user.roleName || 'Controller'}</div>
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
        {tab !== 'tasks' && (
          <GAGrid
            title={TABS.find(t => t.id === tab)?.label || 'Finance'}
            entityName={tab.slice(0, -1)}
            columns={
              tab === 'transactions' ? [
                { key: 'name', label: 'Name' },
                { key: 'description', label: 'Description' },
                { key: 'amount', label: 'Amount', type: 'currency' as const },
                { key: 'transactionType', label: 'Type', type: 'badge' as const },
                { key: 'transactionDate', label: 'Date', type: 'date' as const },
                { key: 'approved', label: 'Approved', render: (v: any) => v ? '✅ Yes' : '⏳ Pending' },
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
              ] : tab === 'channels' ? [
                { key: 'channelName', label: 'Channel', type: 'avatar' as const },
                { key: 'channelType', label: 'Type', type: 'badge' as const },
                { key: 'activeStatus', label: 'Active', render: (v: any) => v ? '✅ Active' : '❌ Inactive' },
                { key: 'lastUsedDate', label: 'Last Used', type: 'date' as const },
              ] : [
                { key: 'accountName', label: 'Account', type: 'avatar' as const },
                { key: 'accountType', label: 'Type', type: 'badge' as const },
                { key: 'bankName', label: 'Bank' },
                { key: 'openingBalance', label: 'Opening', type: 'currency' as const },
                { key: 'currentBalance', label: 'Balance', type: 'currency' as const },
                { key: 'currency', label: 'Currency' },
                { key: 'status', label: 'Status', type: 'status' as const },
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
      <NotificationCenter currentApp="finance" />

      {showEntityForm && (
        <EntityForm
          title={editingRecord ? `Update ${TABS.find(t => t.id === tab)?.label || tab}` : `New ${TABS.find(t => t.id === tab)?.label || tab}`}
          fields={
            tab === 'transactions' ? [
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
              { key: 'invoiceDoc', label: 'Invoice Document', type: 'file' as const },
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
              { key: 'accountName', label: 'Account Name', type: 'text' as const, required: true },
              {
                key: 'accountType', label: 'Account Type', type: 'select' as const, options: [
                  { value: 'current', label: 'Current' }, { value: 'savings', label: 'Savings' },
                  { value: 'credit', label: 'Credit' }, { value: 'petty_cash', label: 'Petty Cash' },
                  { value: 'investment', label: 'Investment' },
                ]
              },
              { key: 'bankName', label: 'Bank Name', type: 'text' as const },
              { key: 'accountNumber', label: 'Account Number', type: 'text' as const },
              { key: 'openingBalance', label: 'Opening Balance ($)', type: 'number' as const },
              { key: 'currentBalance', label: 'Current Balance ($)', type: 'number' as const },
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
            ] : [
              { key: 'channelName', label: 'Channel Name', type: 'text' as const, required: true },
              {
                key: 'channelType', label: 'Channel Type', type: 'select' as const, options: [
                  { value: 'bank_transfer', label: 'Bank Transfer' }, { value: 'cash', label: 'Cash' },
                  { value: 'cheque', label: 'Cheque' }, { value: 'card', label: 'Card' },
                  { value: 'mobile_money', label: 'Mobile Money' }, { value: 'crypto', label: 'Crypto' },
                ]
              },
              { key: 'activeStatus', label: 'Is Active', type: 'select' as const, options: [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] },
              { key: 'lastUsedDate', label: 'Last Used Date', type: 'date' as const },
            ]
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
            { key: 'invoiceDoc', label: 'Invoice Document', type: 'file', pathPrefix: 'invoices' },
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
            { key: 'accountName', label: 'Account Name', type: 'text' as const, required: true },
            {
              key: 'accountType', label: 'Account Type', type: 'select' as const, options: [
                { value: 'current', label: 'Current' }, { value: 'savings', label: 'Savings' },
                { value: 'credit', label: 'Credit' }, { value: 'petty_cash', label: 'Petty Cash' },
              ]
            },
            { key: 'bankName', label: 'Bank Name', type: 'text' as const },
            { key: 'accountNumber', label: 'Account Number', type: 'text' as const },
            { key: 'openingBalance', label: 'Opening Balance ($)', type: 'number' as const },
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

      {showNestedForm === 'channel' && (
        <EntityForm
          title="New Channel"
          fields={[
            { key: 'channelName', label: 'Channel Name', type: 'text' as const, required: true },
            {
              key: 'channelType', label: 'Channel Type', type: 'select' as const, options: [
                { value: 'bank_transfer', label: 'Bank Transfer' }, { value: 'cash', label: 'Cash' },
                { value: 'cheque', label: 'Cheque' }, { value: 'card', label: 'Card' },
                { value: 'mobile_money', label: 'Mobile Money' },
              ]
            },
            { key: 'activeStatus', label: 'Is Active', type: 'select' as const, options: [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] },
          ]}
          onClose={() => setShowNestedForm(null)}
          onSubmit={async (formData) => {
            const res = await fetch(`${API}/finance/channels`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
              body: JSON.stringify(formData),
            });
            if (!res.ok) throw new Error('Failed to create channel');
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
