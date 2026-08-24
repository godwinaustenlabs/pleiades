import { useState, useEffect, useMemo } from 'react';
import {
  Scale, Gavel, FileCheck, LogOut,
  Book, ShieldCheck, Home, Loader2, Lock, MessageSquare, Users
} from 'lucide-react';
import Login from './Login';
import GAGrid from '../components/GAGrid';
import EntityForm from '../components/EntityForm';
import ProfileModal from '../components/ProfileModal';
import TaskBoard from '../components/TaskBoard';
import NotificationCenter from '../components/NotificationCenter';
import MobileTabMenu from '../components/MobileTabMenu';
import { API, token } from '../lib/auth';
import { usePermissions } from '../lib/usePermissions';
import { errorMessage } from '../lib/errors';


type Tab = 'agreements' | 'templates' | 'compliance' | 'ip' | 'requests' | 'sops' | 'parties' | 'tasks';

function Legal() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!token());
  const [tab, setTab] = useState<Tab>('agreements');
  const [showProfile, setShowProfile] = useState(false);
  const [showEntityForm, setShowEntityForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [committees, setCommittees] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [agreements, setAgreements] = useState<any[]>([]);
  const [parties, setParties] = useState<any[]>([]);
  const [showNestedForm, setShowNestedForm] = useState<string | null>(null);

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
    return userPermissions.find(p => p.appName === 'legal' && p.feature === feature) || {
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
    fetch(`${API}/legal/${tab}`, { headers: { Authorization: `Bearer ${token()}` } })
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
    fetchWithAuth(`${API}/core/committees`, setCommittees);
    fetchWithAuth(`${API}/core/clients`, setClients);
    fetchWithAuth(`${API}/legal/templates`, setTemplates);
    fetchWithAuth(`${API}/legal/agreements`, setAgreements);
    fetchWithAuth(`${API}/legal/parties`, setParties);
  };


  useEffect(() => {
    if (isAuthenticated && permsLoaded) {
      fetchData();
      fetchRelations();
    }
  }, [tab, isAuthenticated, permsLoaded]);



  // Tab filtering
  const TABS = useMemo(() => {
    const all = [
      { id: 'agreements', label: 'Agreements', icon: FileCheck, feature: 'agreements' },
      { id: 'templates', label: 'Templates', icon: Book, feature: 'templates' },
      { id: 'compliance', label: 'Compliance', icon: ShieldCheck, feature: 'compliance' },
      { id: 'ip', label: 'Intellectual Property', icon: Gavel, feature: 'ip' },
      { id: 'requests', label: 'Legal Requests', icon: MessageSquare, feature: 'requests' },
      { id: 'sops', label: 'SOPs', icon: Book, feature: 'sops' },
      { id: 'parties', label: 'Parties', icon: Users, feature: 'parties' },
      { id: 'tasks', label: 'Tasks', icon: Scale, feature: 'tasks' },
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
  if (!permsLoaded) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-12 h-12 text-amber-400 animate-spin" /></div>;

  if (TABS.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="glass-panel p-12 rounded-[2.5rem] text-center space-y-6 max-w-md border border-white/10 shadow-2xl">
          <div className="w-20 h-20 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto border border-amber-500/20">
            <Lock className="w-10 h-10 text-amber-400" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Legal Restricted</h2>
          <p className="text-textSecondary text-sm leading-relaxed">
            Confidential counsel access is strictly gated by legal compliance.
            Contact the General Counsel to provision your granular feature access.
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
    const url = editingRecord ? `${API}/legal/${tab}/${editingRecord.id}` : `${API}/legal/${tab}`;

    // Ensure boolean fields are correctly typed
    const cleanData = { ...formData };
    if (tab === 'agreements' && typeof cleanData.autoRenewal === 'string') {
      cleanData.autoRenewal = cleanData.autoRenewal === 'true';
    }
    if (tab === 'templates' && typeof cleanData.isLatest === 'string') {
      cleanData.isLatest = cleanData.isLatest === 'true';
    }

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(cleanData),
      });
      if (res.status === 401) { handleLogout(); return; }
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to save ${tab.slice(0, -1)}`);
      }
      setShowEntityForm(false);
      setEditingRecord(null);
      fetchData();
    } catch (err) {
      alert(errorMessage(err, 'An error occurred while saving.'));
      throw err;
    }
  };

  const currentFeature = TABS.find(t => t.id === tab)?.feature || 'agreements';
  const p = getPerm(currentFeature);

  return (
    <div className="min-h-screen flex flex-col bg-background font-sans text-textPrimary animate-in fade-in duration-700">
      <header className="glass-panel sticky top-0 z-50 px-4 py-3 md:px-8 md:py-4 flex items-center justify-between border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="bg-amber-500/20 p-2 rounded-xl border border-amber-500/20 shadow-lg shadow-amber-500/5">
            <Scale className="w-5 h-5 md:w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-black tracking-tighter leading-none"><span className="text-amber-400">LEGAL</span></h1>
            <span className="text-[8px] md:text-[10px] uppercase tracking-[0.2em] text-textSecondary font-black leading-none">Corporate Compliance</span>
          </div>
          <button onClick={() => window.location.href = '/'} className="ml-1 md:ml-2 p-2 text-textSecondary hover:text-amber-400 hover:bg-amber-400/10 rounded-xl transition-all">
            <Home className="w-4 h-4 md:w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          <button onClick={() => setShowProfile(true)} className="flex items-center gap-2 md:gap-3 pl-2 pr-2 md:pr-4 py-1 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all group">
            <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center font-bold text-[10px] md:text-xs shadow-lg shadow-amber-500/20 overflow-hidden">
              {user.profilePhoto ? (
                <img src={getProfileUrl(user.profilePhoto)!} alt="User" className="w-full h-full object-cover" />
              ) : (
                user.name?.charAt(0) || user.email?.charAt(0).toUpperCase()
              )}
            </div>
            <div className="text-left hidden sm:block">
              <div className="text-xs font-black leading-none mb-0.5">{user.name || user.username || 'Legal'}</div>
              <div className="text-[10px] text-textSecondary leading-none uppercase tracking-widest font-black">{user.title || 'Counsel'}</div>
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
                ? 'border-amber-400 text-amber-400 bg-amber-400/5'
                : 'border-transparent text-textSecondary hover:text-textPrimary hover:bg-white/5'
                }`}>
              <t.icon className={`w-3 h-3 md:w-3.5 md:h-3.5 ${tab === t.id ? 'text-amber-400' : 'text-textSecondary'}`} />
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
          accentColor="amber-400"
        />
        {tab !== 'tasks' && (
          <GAGrid
            title={TABS.find(t => t.id === tab)?.label || 'Legal'}
            entityName={tab.slice(0, -1)}
            columns={
              tab === 'agreements' ? [
                { key: 'agreementName', label: 'Agreement', type: 'avatar' as const },
                { key: 'contractType', label: 'Type', type: 'badge' as const },
                { key: 'paymentTerms', label: 'Payment Terms' },
                { key: 'status', label: 'Status', type: 'status' as const },
                { key: 'effectiveDate', label: 'Effective', type: 'date' as const },
                { key: 'expiryDate', label: 'Expiry', type: 'date' as const },
                { key: 'signedDoc', label: 'Document', type: 'file' as const },
                { key: 'autoRenewal', label: 'Auto Renewal', render: (v: any) => v ? '✅ Yes' : '❌ No' },
              ] : tab === 'templates' ? [
                { key: 'documentName', label: 'Template', type: 'avatar' as const },
                { key: 'versionNumber', label: 'Version', type: 'badge' as const },
                { key: 'jurisdiction', label: 'Jurisdiction' },
                { key: 'approvedBy', label: 'Approved By' },
                { key: 'lastUpdated', label: 'Last Updated', type: 'date' as const },
                { key: 'templateFile', label: 'File', type: 'file' as const },
              ] : tab === 'compliance' ? [
                { key: 'obligationName', label: 'Obligation', type: 'avatar' as const },
                { key: 'appliesTo', label: 'Applies To' },
                { key: 'assignedOfficer', label: 'Officer' },
                { key: 'jurisdiction', label: 'Jurisdiction' },
                { key: 'status', label: 'Status', type: 'status' as const },
                { key: 'dueDate', label: 'Due Date', type: 'date' as const },
                { key: 'supportingDoc', label: 'Proof', type: 'file' as const },
              ] : tab === 'requests' ? [
                { key: 'requestTitle', label: 'Request', type: 'avatar' as const },
                { key: 'category', label: 'Category', type: 'badge' as const },
                { key: 'priority', label: 'Priority', type: 'badge' as const },
                { key: 'status', label: 'Status', type: 'status' as const },
                { key: 'assignedMember', label: 'Assigned To' },
                { key: 'dateSubmitted', label: 'Submitted', type: 'date' as const },
              ] : tab === 'sops' ? [
                { key: 'sopTitle', label: 'SOP Title', type: 'avatar' as const },
                { key: 'applicableDept', label: 'Department', type: 'badge' as const },
                { key: 'policyType', label: 'Policy Type' },
                { key: 'approvalStatus', label: 'Status', type: 'status' as const },
                { key: 'effectiveDate', label: 'Effective', type: 'date' as const },
                { key: 'lastReviewed', label: 'Last Reviewed', type: 'date' as const },
                { key: 'docAttachment', label: 'File', type: 'file' as const },
              ] : tab === 'ip' ? [
                { key: 'assetName', label: 'Asset', type: 'avatar' as const },
                { key: 'ipType', label: 'Type', type: 'badge' as const },
                { key: 'registeredOwner', label: 'Owner' },
                { key: 'registrationNumber', label: 'Reg #' },
                { key: 'jurisdiction', label: 'Jurisdiction' },
                { key: 'status', label: 'Status', type: 'status' as const },
                { key: 'filingDate', label: 'Filed', type: 'date' as const },
                { key: 'expiryDate', label: 'Expiry', type: 'date' as const },
                { key: 'supportingDocs', label: 'Docs', type: 'file' as const },
              ] : [
                { key: 'entityName', label: 'Party Name', type: 'avatar' as const },
                { key: 'type', label: 'Type', type: 'badge' as const },
                { key: 'riskStatus', label: 'Risk', type: 'status' as const },
                { key: 'jurisdiction', label: 'Jurisdiction' },
                { key: 'createdAt', label: 'Added', type: 'date' as const },
              ]
            }
            data={data}
            loading={loading}
            onAdd={() => { setEditingRecord(null); setShowEntityForm(true); }}
            onEdit={(r) => { setEditingRecord(r); setShowEntityForm(true); }}
            onDelete={async (r) => {
              if (!confirm(`Irreversible deletion of legal record. Confirm? This action cannot be undone.`)) return;
              try {
                const res = await fetch(`${API}/legal/${tab}/${r.id}`, {
                  method: 'DELETE',
                  headers: { Authorization: `Bearer ${token()}` }
                });
                if (res.status === 401) { handleLogout(); return; }
                if (!res.ok) {
                  const errData = await res.json().catch(() => ({}));
                  throw new Error(errData.error || `Failed to delete ${tab.slice(0, -1)}`);
                }
                fetchData();
              } catch (err) {
                alert(errorMessage(err, 'An error occurred during deletion.'));
              }
            }}
            canAdd={p.canEdit}
            canEdit={p.canEdit}
            canDelete={p.canDelete}
          />
        )}
        {tab === 'tasks' && <TaskBoard department="Legal" canEdit={getPerm('tasks').canEdit} />}
      </main>

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
      <NotificationCenter currentApp="legal" />

      {showEntityForm && (
        <EntityForm
          title={editingRecord ? `Update ${tab.slice(0, -1)}` : `New ${tab.slice(0, -1)}`}
          fields={
            tab === 'agreements' ? [
              { key: 'agreementName', label: 'Agreement Title', type: 'text' as const, required: true },
              {
                key: 'contractType', label: 'Contract Type', type: 'select' as const, options: [
                  { value: 'nda', label: 'NDA' }, { value: 'service', label: 'Service Agreement' },
                  { value: 'employment', label: 'Employment' }, { value: 'vendor', label: 'Vendor Contract' },
                  { value: 'partnership', label: 'Partnership' }, { value: 'mou', label: 'MOU' },
                ]
              },
              {
                key: 'status', label: 'Status', type: 'select' as const, options: [
                  { value: 'draft', label: 'Draft' }, { value: 'pending_review', label: 'Pending Review' },
                  { value: 'active', label: 'Active' }, { value: 'expired', label: 'Expired' }, { value: 'terminated', label: 'Terminated' },
                ], required: true
              },
              { key: 'effectiveDate', label: 'Effective Date', type: 'date' as const },
              { key: 'expiryDate', label: 'Expiry Date', type: 'date' as const },
              { key: 'autoRenewal', label: 'Auto Renewal', type: 'select' as const, options: [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] },
              { key: 'paymentTerms', label: 'Payment Terms', type: 'textarea' as const },
              { key: 'committeeId', label: 'Associated Committee', type: 'select' as const, options: committees.map(c => ({ value: c.id, label: c.committeeName })) },
              { key: 'clientId', label: 'Associated Client', type: 'select' as const, options: clients.map(c => ({ value: c.id, label: c.clientName })) },
              { key: 'templateId', label: 'Base Template', type: 'select' as const, options: templates.map(t => ({ value: t.id, label: t.documentName })) },
              { key: 'partyId', label: 'Primary Party', type: 'select' as const, options: parties.map(p => ({ value: p.id, label: p.entityName })), action: { label: '+ New Party', onClick: () => setShowNestedForm('party') } },
              { key: 'signedDoc', label: 'Signed Document', type: 'file' as const },
            ] : tab === 'templates' ? [
              { key: 'documentName', label: 'Template Name', type: 'text' as const, required: true },
              { key: 'versionNumber', label: 'Version Number', type: 'text' as const },
              { key: 'jurisdiction', label: 'Jurisdiction', type: 'text' as const },
              { key: 'lastUpdated', label: 'Last Updated', type: 'date' as const },
              { key: 'approvedBy', label: 'Approved By', type: 'text' as const },
              { key: 'isLatest', label: 'Is Latest Version', type: 'select' as const, options: [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }] },
              { key: 'templateFile', label: 'Template File', type: 'file' as const },
            ] : tab === 'compliance' ? [
              { key: 'obligationName', label: 'Obligation Name', type: 'text' as const, required: true },
              { key: 'appliesTo', label: 'Applies To (Dept/Role)', type: 'text' as const },
              { key: 'dueDate', label: 'Due Date', type: 'date' as const },
              {
                key: 'status', label: 'Status', type: 'select' as const, options: [
                  { value: 'active', label: 'Active' }, { value: 'pending', label: 'Pending' },
                  { value: 'completed', label: 'Completed' }, { value: 'overdue', label: 'Overdue' },
                ], required: true
              },
              { key: 'jurisdiction', label: 'Jurisdiction', type: 'text' as const },
              { key: 'assignedOfficer', label: 'Assigned Officer', type: 'text' as const },
              { key: 'supportingDoc', label: 'Supporting Document', type: 'file' as const },
              { key: 'agreementId', label: 'Linked Agreement', type: 'select' as const, options: agreements.map(a => ({ value: a.id, label: a.agreementName })) },
            ] : tab === 'requests' ? [
              { key: 'requestTitle', label: 'Request Title', type: 'text' as const, required: true },
              {
                key: 'category', label: 'Category', type: 'select' as const, options: [
                  { value: 'contract_review', label: 'Contract Review' }, { value: 'compliance', label: 'Compliance' },
                  { value: 'dispute', label: 'Dispute' }, { value: 'advice', label: 'Legal Advice' }, { value: 'filing', label: 'Filing' },
                ]
              },
              {
                key: 'priority', label: 'Priority', type: 'select' as const, options: [
                  { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }, { value: 'urgent', label: 'Urgent' },
                ]
              },
              {
                key: 'status', label: 'Status', type: 'select' as const, options: [
                  { value: 'pending', label: 'Pending' }, { value: 'in_progress', label: 'In Progress' },
                  { value: 'resolved', label: 'Resolved' }, { value: 'closed', label: 'Closed' },
                ]
              },
              { key: 'assignedMember', label: 'Assigned Member', type: 'text' as const },
              { key: 'dateSubmitted', label: 'Date Submitted', type: 'date' as const },
              { key: 'resolutionNotes', label: 'Resolution Notes', type: 'textarea' as const },
              { key: 'committeeId', label: 'Associated Committee', type: 'select' as const, options: committees.map(c => ({ value: c.id, label: c.committeeName })) },
              { key: 'partyId', label: 'Related Party', type: 'select' as const, options: parties.map(p => ({ value: p.id, label: p.entityName })), action: { label: '+ New Party', onClick: () => setShowNestedForm('party') } },
              { key: 'agreementId', label: 'Related Agreement', type: 'select' as const, options: agreements.map(a => ({ value: a.id, label: a.agreementName })) },
            ] : tab === 'sops' ? [
              { key: 'sopTitle', label: 'SOP Title', type: 'text' as const, required: true },
              { key: 'applicableDept', label: 'Applicable Department', type: 'text' as const },
              {
                key: 'policyType', label: 'Policy Type', type: 'select' as const, options: [
                  { value: 'operational', label: 'Operational' }, { value: 'hr', label: 'HR' },
                  { value: 'compliance', label: 'Compliance' }, { value: 'financial', label: 'Financial' }, { value: 'it', label: 'IT/Security' },
                ]
              },
              { key: 'effectiveDate', label: 'Effective Date', type: 'date' as const },
              { key: 'lastReviewed', label: 'Last Reviewed', type: 'date' as const },
              { key: 'owner', label: 'SOP Owner', type: 'text' as const },
              {
                key: 'approvalStatus', label: 'Approval Status', type: 'select' as const, options: [
                  { value: 'draft', label: 'Draft' }, { value: 'under_review', label: 'Under Review' },
                  { value: 'approved', label: 'Approved' }, { value: 'deprecated', label: 'Deprecated' },
                ]
              },
              { key: 'docAttachment', label: 'SOP Document', type: 'file' as const },
            ] : tab === 'ip' ? [
              { key: 'assetName', label: 'Asset Name', type: 'text' as const, required: true },
              {
                key: 'ipType', label: 'IP Type', type: 'select' as const, options: [
                  { value: 'trademark', label: 'Trademark' }, { value: 'patent', label: 'Patent' },
                  { value: 'copyright', label: 'Copyright' }, { value: 'trade_secret', label: 'Trade Secret' }, { value: 'design', label: 'Industrial Design' },
                ]
              },
              { key: 'registrationNumber', label: 'Registration Number', type: 'text' as const },
              { key: 'registeredOwner', label: 'Registered Owner', type: 'text' as const },
              { key: 'jurisdiction', label: 'Jurisdiction', type: 'text' as const },
              { key: 'filingDate', label: 'Filing Date', type: 'date' as const },
              { key: 'expiryDate', label: 'Expiry Date', type: 'date' as const },
              {
                key: 'status', label: 'Status', type: 'select' as const, options: [
                  { value: 'pending', label: 'Pending' }, { value: 'active', label: 'Active' },
                  { value: 'opposed', label: 'Opposed' }, { value: 'expired', label: 'Expired' }, { value: 'abandoned', label: 'Abandoned' },
                ], required: true
              },
              { key: 'partyId', label: 'Owning Party', type: 'select' as const, options: parties.map(p => ({ value: p.id, label: p.entityName })), action: { label: '+ New Party', onClick: () => setShowNestedForm('party') } },
              { key: 'supportingDocs', label: 'Supporting Documents', type: 'file' as const },
            ] : [
              { key: 'entityName', label: 'Entity Name', type: 'text' as const, required: true },
              {
                key: 'type', label: 'Party Type', type: 'select' as const, options: [
                  { value: 'individual', label: 'Individual' }, { value: 'company', label: 'Company' },
                  { value: 'government', label: 'Government' }, { value: 'ngo', label: 'NGO' },
                ]
              },
              { key: 'contactInformation', label: 'Contact Information', type: 'textarea' as const },
              { key: 'jurisdiction', label: 'Jurisdiction', type: 'text' as const },
              {
                key: 'riskStatus', label: 'Risk Status', type: 'select' as const, options: [
                  { value: 'low', label: 'Low Risk' }, { value: 'medium', label: 'Medium Risk' }, { value: 'high', label: 'High Risk' },
                ]
              },
              { key: 'partyPhoto', label: 'Party Logo/Photo', type: 'file' as const },
            ]
          }
          initialData={editingRecord}
          onClose={() => { setShowEntityForm(false); setEditingRecord(null); }}
          onSubmit={handleEntitySubmit}
        />
      )}

      {showNestedForm === 'party' && (
        <EntityForm
          title="New Legal Party"
          fields={[
            { key: 'entityName', label: 'Entity Name', type: 'text' as const, required: true },
            {
              key: 'type', label: 'Type', type: 'select' as const, options: [
                { value: 'vendor', label: 'Vendor' }, { value: 'client', label: 'Client' },
                { value: 'regulator', label: 'Regulator' }, { value: 'partner', label: 'Partner' },
              ]
            },
            { key: 'contactInformation', label: 'Contact Info', type: 'textarea' as const },
            {
              key: 'riskStatus', label: 'Risk Status', type: 'select' as const, options: [
                { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' },
              ]
            },
            { key: 'jurisdiction', label: 'Jurisdiction', type: 'text' as const },
          ]}
          onClose={() => setShowNestedForm(null)}
          onSubmit={async (formData) => {
            const res = await fetch(`${API}/legal/parties`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
              body: JSON.stringify(formData),
            });
            if (!res.ok) throw new Error('Failed to create party');
            fetchRelations();
            setShowNestedForm(null);
          }}
        />
      )}
    </div>
  );
}

export default Legal;
