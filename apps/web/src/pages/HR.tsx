import { useState, useEffect, useMemo } from 'react';
import {
  Users, Shield, Activity, LogOut,
  Key, Settings, BarChart3, Plus, Loader2, Save, X, Home, Lock, CheckCircle2, Copy, Check, FileText
} from 'lucide-react';
import Login from './Login';
import GAGrid, { type Column } from '../components/GAGrid';

import TaskBoard from '../components/TaskBoard';
import NotificationCenter from '../components/NotificationCenter';
import AppointmentProvisionForm from '../components/AppointmentProvisionForm';
import ProfileModal from '../components/ProfileModal';
import EntityForm from '../components/EntityForm';
import CropModal from '../components/CropModal';
import MobileTabMenu from '../components/MobileTabMenu';
import HRDashboard from '../components/HRDashboard';
import HRReports from '../components/HRReports';
import PayrollProcessingView from '../components/PayrollProcessingView';
import EmployeeProfileTabs from '../components/EmployeeProfileTabs';
import PaySlip from '../components/PaySlip';
import DocumentsTab from '../components/DocumentsTab';
import { API, token } from '../lib/auth';
import { usePermissions } from '../lib/usePermissions';
import { errorMessage } from '../lib/errors';



type Tab = 'dashboard' | 'directory' | 'payroll' | 'appointments' | 'committees' | 'tasks' | 'resets' | 'reports' | 'sops';

const DEPARTMENT_OPTIONS = [
  { value: '', label: 'None (e.g. CEO)' },
  { value: 'HR', label: 'HR' },
  { value: 'Finance', label: 'Finance' },
  { value: 'Tech', label: 'Tech' },
  { value: 'Legal', label: 'Legal' },
  { value: 'Ops', label: 'Ops' },
  { value: 'Acquisition', label: 'Acquisition' },
];

function HR() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!token());
  const [tab, setTab] = useState<Tab>('dashboard' as any);
  const [showProfile, setShowProfile] = useState(false);
  const [showEntityForm, setShowEntityForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [viewingProfile, setViewingProfile] = useState<any>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [committees, setCommittees] = useState<any[]>([]);
  const [payrollRecords, setPayrollRecords] = useState<any[]>([]);

  const [showAppointmentForm, setShowAppointmentForm] = useState(false);
  const [showPayrollForm, setShowPayrollForm] = useState(false);
  const [viewingPaySlip, setViewingPaySlip] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Granular Permissions
  // Grants come from the shared hook, which resolves them from the user's role.
  const { grants: userPermissions, loaded: permsLoaded } = usePermissions();

  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('ga_user') || '{}'));

  useEffect(() => {
    const handleUpdate = () => {
      setUser(JSON.parse(localStorage.getItem('ga_user') || '{}'));
    };
    window.addEventListener('ga_user_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('ga_user_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const getProfileUrl = (url: string) => {
    if (!url) return null;
    if (url.startsWith('http') || url.startsWith('/api')) return url;
    return `/api/assets/download/${url.startsWith('/') ? url.slice(1) : url}`;
  };

  const handleLogout = () => {
    localStorage.clear();
    setIsAuthenticated(false);
  };


  const getPerm = (feature: string) => {
    // Superadmin bypass (frontend check)
    if (user.isSuperadmin) return { canView: true, canEdit: true, canDelete: true };

    return userPermissions.find(p => p.appName === 'hr' && p.feature === feature) || {
      canView: false, canEdit: false, canDelete: false
    };
  };

  const fetchEmployees = () => {
    setLoading(true);
    fetch(`${API}/core/employees`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => { if (r.status === 401) { handleLogout(); throw new Error(); } return r.json(); })
      .then(d => { setEmployees((d.data || []).filter((e: any) => e.employmentStatus === 'active')); setLoading(false); })
      .catch(() => setLoading(false));
  };

  const fetchAppointments = () => {
    fetch(`${API}/hr/appointments`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => { if (r.status === 401) { handleLogout(); throw new Error(); } return r.json(); })
      .then(d => setAppointments(d.data || [])).catch(() => { });
  };

  const fetchCommittees = () => {
    fetch(`${API}/core/committees`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => { if (r.status === 401) { handleLogout(); throw new Error(); } return r.json(); })
      .then(d => setCommittees(d.data || [])).catch(() => { });
  };

  const fetchPayroll = () => {
    fetch(`${API}/hr/payroll`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => { if (r.status === 401) { handleLogout(); throw new Error(); } return r.json(); })
      .then(d => setPayrollRecords(d.data || [])).catch(() => { });
  };


  useEffect(() => {
    if (isAuthenticated && permsLoaded) {
      if (tab === 'directory' && getPerm('employees').canView) {
        fetchEmployees();
        fetchAppointments(); // Added to show Primary Role in directory
      }
      if (tab === 'appointments' && getPerm('appointments').canView) {
        fetchAppointments();
        fetchEmployees();
        fetchCommittees();
      }
      if (tab === 'committees') {
        fetchCommittees();
        fetchEmployees();
      }
      if (tab === 'payroll' && getPerm('payroll').canView) {
        fetchPayroll();
        fetchEmployees();
      }

      if (getPerm('resets').canView) {
        fetch(`${API}/admin/pending-resets`, { headers: { Authorization: `Bearer ${token()}` } })
          .then(r => r.json())
          .then(d => setPendingCount((d.data || []).length)).catch(() => { });
      }
    }
  }, [tab, isAuthenticated, permsLoaded]);

  // Tab filtering
  const TABS = useMemo(() => {
    const all = [
      { id: 'dashboard', label: 'Dashboard', icon: Activity, feature: 'employees' },
      { id: 'directory', label: 'Directory', icon: Users, feature: 'employees' },
      { id: 'appointments', label: 'Appointments', icon: Shield, feature: 'appointments' },
      { id: 'committees', label: 'Committees', icon: Users, feature: 'employees' }, // shared with employees for HR
      { id: 'payroll', label: 'Payroll', icon: BarChart3, feature: 'payroll' },
      { id: 'tasks', label: 'Tasks', icon: Activity, feature: 'tasks' },
      { id: 'reports', label: 'Reports', icon: FileText, feature: 'employees' },
      { id: 'sops', label: 'SOPs', icon: FileText, feature: 'employees' },
      { id: 'resets', label: 'Resets', icon: Key, badge: pendingCount, feature: 'resets' },
    ] as const;

    if (user.isSuperadmin) return all;
    return all.filter(t => getPerm(t.feature).canView);
  }, [userPermissions, pendingCount, user.isSuperadmin]);

  // Auto-switch tab if current tab is restricted
  useEffect(() => {
    if (permsLoaded && TABS.length > 0 && !TABS.find(t => t.id === tab)) {
      setTab(TABS[0].id);
    }
  }, [TABS, permsLoaded]);

  if (!isAuthenticated) return <Login onLogin={() => setIsAuthenticated(true)} />;
  if (!permsLoaded) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>;

  if (TABS.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="glass-panel p-12 rounded-3xl text-center space-y-6 max-w-md border border-white/10 shadow-2xl">
          <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto border border-red-500/20">
            <Lock className="w-10 h-10 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold">Access Restricted</h2>
          <p className="text-textSecondary text-sm leading-relaxed">
            You do not have any permissions configured for the HR module.
            Please contact a Superadmin to grant you granular feature access.
          </p>
          <button onClick={() => window.location.href = '/'} className="px-8 py-3 bg-white/5 hover:bg-white/10 rounded-full font-bold text-sm transition-all border border-white/10">
            Return Home
          </button>
        </div>
      </div>
    );
  }

  const CopyableId = ({ id }: { id: string }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = (e: React.MouseEvent) => {
      e.stopPropagation();
      navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };
    return (
      <button
        onClick={handleCopy}
        className="group/id flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-white/5 transition-all"
        title="Click to copy ID"
      >
        <span className="font-mono text-[10px] text-textSecondary uppercase tracking-tighter">
          {id.substring(0, 8)}...
        </span>
        {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-textSecondary opacity-0 group-hover/id:opacity-100 transition-opacity" />}
      </button>
    );
  };

  const employeeColumns: Column[] = [
    { key: 'name', label: 'Name', type: 'avatar' },
    {
      key: 'id', label: 'Employee ID',
      render: (v: string) => <CopyableId id={v} />
    },
    {
      key: 'slackId', label: 'Slack ID',
      render: (v: string) => (!v || v === 'NULL') ? <span className="text-textSecondary italic text-[10px]">—</span> : <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">{v}</span>
    },
    { key: 'email', label: 'Email', render: (v) => <span className="text-xs text-textSecondary truncate max-w-[120px] inline-block">{v || '—'}</span> },
    { key: 'phone', label: 'Phone', render: (v) => <span className="text-xs text-textSecondary whitespace-nowrap">{v || '—'}</span> },
    { key: 'department', label: 'Department', type: 'badge' },
    {
      key: 'role', label: 'Primary Role', render: (_v: any, record: any) => {
        const appt = appointments.find(a => a.employeeId === record.id && a.isActive);
        return <span className="text-xs font-bold text-white leading-tight block max-w-[150px]">{appt ? appt.roleOrTitle : <span className="text-textSecondary italic font-normal">No active role</span>}</span>;
      }
    },
    { key: 'employmentStatus', label: 'Status', type: 'status' },
    { key: 'salary', label: 'Salary', type: 'currency' },
  ];

  const payrollColumns: Column[] = [
    { key: 'employeeId', label: 'Employee', render: (v: string) => employees.find(e => e.id === v)?.name || 'Unknown' },
    { key: 'payrollMonth', label: 'Month' },
    { key: 'grossSalary', label: 'Gross Salary', type: 'currency' },
    { key: 'netPay', label: 'Net Pay', type: 'currency' },
    {
      key: 'disbursementStatus',
      label: 'Status',
      render: (v: string, record: any) => (
        <select
          value={v}
          onChange={async (e) => {
            const newStatus = e.target.value;
            // Optimistic update
            setPayrollRecords(prev => prev.map(r => r.id === record.id ? { ...r, disbursementStatus: newStatus } : r));
            try {
              const res = await fetch(`${API}/hr/payroll/${record.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                body: JSON.stringify({ disbursementStatus: newStatus }),
              });
              if (!res.ok) throw new Error();
            } catch {
              // Revert
              setPayrollRecords(prev => prev.map(r => r.id === record.id ? { ...r, disbursementStatus: v } : r));
            }
          }}
          onClick={(e) => e.stopPropagation()}
          className={`bg-surface/50 border border-white/10 rounded-lg px-2.5 py-1 text-xs focus:outline-none font-bold ${
            v === 'paid' ? 'text-green-400' : v === 'processed' ? 'text-blue-400' : 'text-yellow-400'
          }`}
        >
          <option value="pending" className="bg-background text-yellow-400 font-bold">Pending</option>
          <option value="processed" className="bg-background text-blue-400 font-bold">Processed</option>
          <option value="paid" className="bg-background text-green-400 font-bold">Paid</option>
        </select>
      )
    },
    { key: 'paymentDate', label: 'Payment Date', type: 'date' },
    { key: 'financeReference', label: 'Tx Ref' }
  ];

  const handleEmployeeSubmit = async (data: any) => {
    const method = editingRecord ? 'PATCH' : 'POST';
    const url = editingRecord ? `${API}/core/employees/${editingRecord.id}` : `${API}/core/employees`;
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(data),
      });
      if (res.status === 401) { handleLogout(); return; }
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to save employee');
      }
      setShowEntityForm(false);
      setEditingRecord(null);
      fetchEmployees();
    } catch (err) {
      alert(errorMessage(err, 'An error occurred while saving.'));
      throw err; // Re-throw for EntityForm to catch and show in its internal UI
    }
  };

  const handleAppointmentEdit = async (record: any) => {
    setEditingRecord(record);
    setShowAppointmentForm(true);
  };

  const handleAppointmentDelete = async (record: any) => {
    if (!confirm(`CRITICAL WARNING: This will PERMANENTLY DELETE this appointment. Are you sure?`)) return;
    const res = await fetch(`${API}/hr/appointments/${record.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token()}` },
    });
    if (res.status === 401) { handleLogout(); return; }
    fetchAppointments();
  };

  const handleEmployeeDelete = async (record: any) => {
    if (!confirm(`CRITICAL WARNING: This will PERMANENTLY DELETE the employee "${record.name}". Are you sure? This action is IRREVERSIBLE.`)) return;
    try {
      const res = await fetch(`${API}/core/employees/${record.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (res.status === 401) { handleLogout(); return; }
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to delete employee');
      }
      fetchEmployees();
    } catch (err) {
      alert(errorMessage(err, 'An error occurred during deletion.'));
    }
  };

  const handlePayrollSubmit = async (data: any) => {
    const method = editingRecord ? 'PATCH' : 'POST';
    const url = editingRecord ? `${API}/hr/payroll/${editingRecord.id}` : `${API}/hr/payroll`;
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify(data),
    });
    if (res.status === 401) { handleLogout(); return; }
    if (!res.ok) throw new Error('Failed to save payroll record');
    setShowEntityForm(false);
    setEditingRecord(null);
    fetchPayroll();
  };

  const handlePayrollDelete = async (record: any) => {
    if (!confirm(`Permanently delete payroll record for ${record.payrollMonth}?`)) return;
    const res = await fetch(`${API}/hr/payroll/${record.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token()}` },
    });
    if (res.status === 401) { handleLogout(); return; }
    fetchPayroll();
  };

  return (
    <div className="min-h-screen flex flex-col bg-background font-sans text-textPrimary animate-in fade-in duration-700">
      <header className="glass-panel sticky top-0 z-50 px-4 py-3 md:px-8 md:py-4 flex items-center justify-between border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="bg-primary/20 p-2 rounded-xl">
            <Activity className="w-5 h-5 md:w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-bold tracking-tight leading-none"><span className="text-primary">OS</span></h1>
            <span className="text-[8px] md:text-[10px] uppercase tracking-[0.2em] text-textSecondary font-bold">HR Management</span>
          </div>
          <button onClick={() => window.location.href = '/'} className="ml-1 md:ml-2 p-2 text-textSecondary hover:text-primary hover:bg-primary/10 rounded-xl transition-all">
            <Home className="w-4 h-4 md:w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          <button onClick={() => setShowProfile(true)} className="flex items-center gap-2 md:gap-3 pl-2 pr-2 md:pr-4 py-1 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all group">
            <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center font-bold text-[10px] md:text-xs shadow-lg shadow-primary/20 overflow-hidden">
              {user.profilePhoto ? (
                <img
                  src={getProfileUrl(user.profilePhoto)!}
                  alt="User"
                  className="w-full h-full object-cover"
                />
              ) : (
                user.name?.charAt(0) || user.email?.charAt(0).toUpperCase()
              )}
            </div>
            <div className="text-left hidden sm:block">
              <div className="text-xs font-bold leading-none mb-0.5">{user.name || user.username || 'User'}</div>
              <div className="text-[10px] text-textSecondary leading-none uppercase tracking-wider">{user.roleName || 'Employee'}</div>
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
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-textSecondary hover:text-textPrimary hover:bg-white/5'
                }`}>
              <t.icon className={`w-3 h-3 md:w-3.5 md:h-3.5 ${tab === t.id ? 'text-primary' : 'text-textSecondary'}`} />
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
          accentColor="primary"
        />
        
        {tab === 'dashboard' && (
          <HRDashboard 
            employees={employees} 
            attendance={[]} 
            leaves={[]} 
            payroll={payrollRecords} 
            assets={[]} 
          />
        )}
        
        {tab === 'directory' && (
          <GAGrid
            title="Employee Directory"
            entityName="employee"
            columns={employeeColumns}
            data={employees}
            loading={loading}
            rowActions={[{ label: 'View Master Profile', icon: Users, onClick: (record) => setViewingProfile(record) }]}
            onAdd={() => { setEditingRecord(null); setShowEntityForm(true); }}
            onEdit={(r) => { setEditingRecord(r); setShowEntityForm(true); }}
            onDelete={handleEmployeeDelete}
            canAdd={getPerm('employees').canEdit}
            canEdit={getPerm('employees').canEdit}
            canDelete={getPerm('employees').canDelete}
          />
        )}

        {tab === 'resets' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold">Password Reset Requests</h2>
            <div className="glass-panel rounded-3xl p-12 text-center text-textSecondary border border-white/10">
              <Key className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="text-sm">Delegated reset approval flow is active. Only users with "Resets" permission can approve.</p>
            </div>
          </div>
        )}

        {tab === 'payroll' && (
          <div className="space-y-12">
            <PayrollProcessingView employees={employees} onPayrollGenerated={fetchPayroll} />
            <div className="pt-8 border-t border-white/10">
              <GAGrid
                title="Payroll History"
                entityName="record"
                columns={payrollColumns}
                data={payrollRecords}
                loading={loading}
                canAdd={false}
                canEdit={false}
                canDelete={getPerm('payroll').canDelete}
                rowActions={[
                  {
                    label: 'View Pay Slip',
                    icon: FileText,
                    onClick: (record) => setViewingPaySlip(record),
                  }
                ]}
                onDelete={handlePayrollDelete}
              />
            </div>
          </div>
        )}
        
        {tab === 'reports' && (
          <HRReports employees={employees} />
        )}

        {tab === 'sops' && (
          <DocumentsTab
            endpoint="/hr/company-documents"
            uploadPrefix="company-docs"
            heading="SOPs & Documents"
            description="Manage company-wide standard operating procedures, manuals, and policies."
            documentTypes={['SOP', 'Policy', 'Manual', 'Template', 'Other']}
            canEdit={getPerm('employees').canEdit}
            canDelete={getPerm('employees').canDelete}
          />
        )}

        {tab === 'appointments' && (
          <GAGrid
            title="Account Provisioning & Appointments"
            entityName="appointment"
            columns={[
              { key: 'roleOrTitle', label: 'Title', type: 'avatar' },
              { key: 'employeeId', label: 'Employee', render: (v) => employees.find(e => e.id === v)?.name || v },
              { key: 'committeeId', label: 'Committee', render: (v) => committees.find(c => c.id === v)?.committeeName || 'None' },
              { key: 'appointmentDate', label: 'Date', type: 'date' },
              { key: 'isActive', label: 'Status', render: (v) => v ? '✅ Active' : '❌ Expired' },
            ]}
            data={appointments}
            onAdd={() => { setEditingRecord(null); setShowAppointmentForm(true); }}
            onEdit={handleAppointmentEdit}
            onDelete={handleAppointmentDelete}
            canAdd={getPerm('appointments').canEdit}
            canEdit={getPerm('appointments').canEdit}
            canDelete={getPerm('appointments').canDelete}
          />
        )}

        {tab === 'committees' && (
          <GAGrid
            title="Organizational Committees"
            entityName="committee"
            columns={[
              { key: 'committeeName', label: 'Committee Name', type: 'avatar' },
              { key: 'purpose', label: 'Purpose' },
              { key: 'headEmployeeId', label: 'Head', render: (v) => employees.find(e => e.id === v)?.name || v },
              { key: 'activeStatus', label: 'Status', render: (v) => v ? '✅ Active' : '❌ Inactive' },
            ]}
            data={committees}
            canAdd={false} canEdit={false} canDelete={false} // Read-only view for HR unless ops access is granted elsewhere
          />
        )}

        {tab === 'tasks' && <TaskBoard department="HR" canEdit={getPerm('tasks').canEdit} />}
      </main>

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
      {viewingProfile && <EmployeeProfileTabs employee={viewingProfile} onClose={() => setViewingProfile(null)} />}
      {viewingPaySlip && (
        <PaySlip
          record={viewingPaySlip}
          employee={employees.find(e => e.id === viewingPaySlip.employeeId) || { id: viewingPaySlip.employeeId, name: viewingPaySlip.employeeName || 'Employee' }}
          onClose={() => setViewingPaySlip(null)}
        />
      )}
      <NotificationCenter currentApp="hr" />

      {showEntityForm && (
        <EmployeeForm
          initialData={editingRecord}
          appointments={appointments.filter(a => a.employeeId === editingRecord?.id)}
          employees={employees}
          onClose={() => { setShowEntityForm(false); setEditingRecord(null); }}
          onSubmit={handleEmployeeSubmit}
          canEditPermissions={getPerm('appointments').canEdit}
          onAddAppointment={() => {
            const empId = editingRecord?.id;
            setEditingRecord({ employeeId: empId });
            setShowEntityForm(false);
            setShowAppointmentForm(true);
          }}
          onEditAppointment={(appt) => {
            handleAppointmentEdit(appt);
            setShowEntityForm(false);
          }}
        />
      )}

      {showAppointmentForm && (
        <AppointmentProvisionForm
          employees={employees} committees={committees}
          initialData={editingRecord}
          onClose={() => { setShowAppointmentForm(false); setEditingRecord(null); }}
          onSubmit={async (data) => {
            const res = await fetch(`${API}/hr/appointments/provision`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
              body: JSON.stringify(data),
            });
            if (res.status === 401) { handleLogout(); return; }
            if (!res.ok) throw new Error((await res.json()).error || 'Failed to provision');
            setShowAppointmentForm(false);
            setEditingRecord(null);
            fetchAppointments();
          }}
        />
      )}

      {showPayrollForm && (
        <EntityForm
          title={editingRecord ? 'Edit Payroll Record' : 'New Payroll Record'}
          fields={[
            { key: 'employeeId', label: 'Employee', type: 'select', required: true, options: employees.map(e => ({ value: e.id, label: e.name })) },
            { key: 'payrollMonth', label: 'Payroll Month (e.g. YYYY-MM)', type: 'text', required: true },
            { key: 'grossSalary', label: 'Gross Salary', type: 'number', required: true },
            { key: 'withholdingTax', label: 'Withholding Tax', type: 'number' },
            { key: 'otherDeductions', label: 'Other Deductions', type: 'number' },
            { key: 'bonuses', label: 'Bonuses', type: 'number' },
            { key: 'netPay', label: 'Net Pay', type: 'number', required: true },
            { key: 'raiseAmount', label: 'Raise Amount', type: 'number' },
            { key: 'disbursementStatus', label: 'Disbursement Status', type: 'select', required: true, options: [{ value: 'pending', label: 'Pending' }, { value: 'processed', label: 'Processed' }, { value: 'paid', label: 'Paid' }], initialValue: 'pending' },
            { key: 'paymentDate', label: 'Payment Date', type: 'date' },
            { key: 'financeReference', label: 'Finance Reference', type: 'text' }
          ]}
          initialData={editingRecord}
          onClose={() => { setShowPayrollForm(false); setEditingRecord(null); }}
          onSubmit={handlePayrollSubmit}
          onChange={(data) => {
            const gross = parseFloat(data.grossSalary) || 0;
            const tax = parseFloat(data.withholdingTax) || 0;
            const other = parseFloat(data.otherDeductions) || 0;
            const bonuses = parseFloat(data.bonuses) || 0;
            return {
              ...data,
              netPay: parseFloat((gross - tax - other + bonuses).toFixed(2))
            };
          }}
        />
      )}
    </div>
  );
}

export default HR;

/* ── SPECIALIZED EMPLOYEE FORM ── */
interface EmployeeFormProps {
  initialData: any;
  appointments: any[];
  employees: any[];
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
  onAddAppointment: () => void;
  onEditAppointment: (appt: any) => void;
  canEditPermissions?: boolean;
}

function EmployeeForm({ initialData, appointments, employees, onClose, onSubmit, onAddAppointment, onEditAppointment, canEditPermissions }: EmployeeFormProps) {
  const [formData, setFormData] = useState(initialData || { name: '', department: '', employmentStatus: 'active', profilePhoto: null, slackId: '', hireDate: '', baseSalary: 0, efficiencyScore: 0, sectorId: '', cnic: '', dob: '', gender: 'Male', address: '', emergencyContact: '', contactInfo: '', designation: '', reportingManagerId: '', employmentType: 'Full-time', confirmationDate: '', contractStartDate: '', contractEndDate: '', assignedOffice: '', bankDetails: '', taxInformation: '' });
  const [assets, setAssets] = useState<any[]>([]);
  const [unassignedAssets, setUnassignedAssets] = useState<any[]>([]);

  useEffect(() => {
    if (initialData?.id) {
      fetch(`${API}/hr/assets?assigned_to=${initialData.id}`, { headers: { Authorization: `Bearer ${token()}` } })
        .then(r => r.json()).then(d => setAssets(d.data || []));
      fetch(`${API}/hr/assets`, { headers: { Authorization: `Bearer ${token()}` } })
        .then(r => r.json()).then(d => setUnassignedAssets((d.data || []).filter((a: any) => !a.assignedTo)));
    }
  }, [initialData?.id]);

  const handleAssignAsset = async (assetId: string) => {
    try {
      await fetch(`${API}/hr/assets/${assetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ assignedTo: initialData.id, status: 'Assigned', issueDate: new Date().toISOString().split('T')[0] })
      });
      const assigned = unassignedAssets.find(a => a.id === assetId);
      if (assigned) {
        setAssets([...assets, { ...assigned, assignedTo: initialData.id, status: 'Assigned' }]);
        setUnassignedAssets(unassignedAssets.filter(a => a.id !== assetId));
      }
    } catch { /* non-fatal: leave prior state */ }
  };

  const handleUnassignAsset = async (assetId: string) => {
    try {
      await fetch(`${API}/hr/assets/${assetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ assignedTo: null, status: 'Available' })
      });
      const unassigned = assets.find(a => a.id === assetId);
      if (unassigned) {
        setUnassignedAssets([...unassignedAssets, { ...unassigned, assignedTo: null, status: 'Available' }]);
        setAssets(assets.filter(a => a.id !== assetId));
      }
    } catch { /* non-fatal: leave prior state */ }
  };

  const [loading, setLoading] = useState(false);
  const [uploading] = useState(false);
  const [error, setError] = useState('');

  const [rawImage, setRawImage] = useState<string | null>(null);

  const getProfileUrl = (url: string | null) => {
    if (!url) return null;
    if (url.startsWith('http') || url.startsWith('/api')) return url;
    return `/api/assets/download/${url.startsWith('/') ? url.slice(1) : url}`;
  };

  const handleSaveCrop = async (blob: Blob) => {
    setError('');
    try {
      const tokenString = token();
      const formData = new FormData();
      formData.append('file', blob, 'avatar.jpg');
      if (initialData?.id) {
        formData.append('employeeId', initialData.id);
      }

      const res = await fetch(`${API}/auth/profile/avatar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenString}` },
        body: formData
      });

      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Upload failed');

      if (d.success) {
        const finalUrl = `${d.data.avatarUrl}?t=${Date.now()}`;
        setFormData({ ...formData, profilePhoto: finalUrl });

        // If we are editing the LOGGED IN user's employee record, update their profile photo too
        const localUser = JSON.parse(localStorage.getItem('ga_user') || '{}');
        if (localUser.employeeId === initialData?.id || localUser.id === initialData?.userId) {
            localStorage.setItem('ga_user', JSON.stringify({
                ...localUser,
                profilePhoto: finalUrl
            }));
            window.dispatchEvent(new Event('ga_user_updated'));
        }

        setRawImage(null);
      } else {
        throw new Error(d.error || 'Upload failed');
      }
    } catch (err) { 
      setError(errorMessage(err, 'Photo upload failed')); 
      // Re-throw so CropModal knows it failed and shows its internal error UI
      throw err;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try { await onSubmit(formData); } catch { alert('Error saving'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md p-4" onClick={onClose}>
      <div className="glass-panel rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl border border-white/20 animate-in fade-in zoom-in duration-200 flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/5 shrink-0">
          <h2 className="text-xl font-bold text-white">{initialData ? 'Edit Profile' : 'Create Profile'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-textSecondary"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 overflow-y-auto flex-1 space-y-8 custom-scrollbar min-h-0">
          {error && <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-bold">{error}</div>}

          <div className="flex items-center gap-8">
            <div className="relative group">
              <div className="w-24 h-24 rounded-[2rem] overflow-hidden bg-white/5 border border-white/10 group-hover:border-primary/50 transition-all">
                {formData.profilePhoto ? (
                  <img
                    src={getProfileUrl(formData.profilePhoto)!}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-textSecondary"><Users className="w-8 h-8 opacity-20" /></div>
                )}
              </div>
              <input
                type="file"
                accept="image/*"
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (ev) => setRawImage(ev.target?.result as string);
                    reader.readAsDataURL(file);
                    e.target.value = ''; // Reset
                  }
                }}
              />

              {uploading && <div className="absolute inset-0 bg-black/50 rounded-[2rem] flex items-center justify-center"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>}
            </div>
            <div className="flex-1 space-y-4">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Full Name</label>
                <input required type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Slack ID</label>
                  <input type="text" value={formData.slackId || ''} onChange={e => setFormData({ ...formData, slackId: e.target.value })} placeholder="U123456" className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Hire Date</label>
                  <input type="date" value={formData.hireDate || ''} onChange={e => setFormData({ ...formData, hireDate: e.target.value })} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Email Address</label>
                  <input type="email" value={formData.email || ''} onChange={e => setFormData({ ...formData, email: e.target.value })} placeholder="email@gaos.org" className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Phone Number</label>
                  <input type="tel" value={formData.phone || ''} onChange={e => setFormData({ ...formData, phone: e.target.value })} placeholder="+1 (555) 000-0000" className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">CNIC / ID</label>
                  <input type="text" value={formData.cnic || ''} onChange={e => setFormData({ ...formData, cnic: e.target.value })} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Date of Birth</label>
                  <input type="date" value={formData.dob || ''} onChange={e => setFormData({ ...formData, dob: e.target.value })} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Emergency Contact</label>
                  <input type="text" value={formData.emergencyContact || ''} onChange={e => setFormData({ ...formData, emergencyContact: e.target.value })} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Gender</label>
                  <select value={formData.gender || ''} onChange={e => setFormData({ ...formData, gender: e.target.value })} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50">
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5 mt-4">
                <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Full Address</label>
                <textarea rows={2} value={formData.address || ''} onChange={e => setFormData({ ...formData, address: e.target.value })} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50 resize-none" />
              </div>

            </div>
          </div>

          <div className="grid grid-cols-1 gap-6">

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-primary uppercase tracking-widest">Appointments & Access</h3>
                {canEditPermissions && (
                  <button type="button" onClick={onAddAppointment} className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-[10px] font-black hover:bg-primary/20 transition-all uppercase tracking-widest border border-primary/20">
                    <Plus className="w-3 h-3" /> Grant Access
                  </button>
                )}
              </div>

              {appointments.length === 0 ? (
                <div className="p-8 rounded-2xl border border-dashed border-white/10 bg-white/5 text-center">
                  <Shield className="w-8 h-8 mx-auto mb-3 opacity-10 text-primary" />
                  <p className="text-xs text-textSecondary italic">No active appointments or digital access granted.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {appointments.map(appt => (
                    <div key={appt.id} className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/10 group hover:border-primary/30 transition-all">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center font-bold text-primary text-xs border border-primary/20">{appt.roleOrTitle.charAt(0)}</div>
                        <div>
                          <p className="text-sm font-bold text-white leading-none mb-1">{appt.roleOrTitle}</p>
                          <p className="text-[10px] text-textSecondary uppercase tracking-widest font-medium">{appt.termType} • {new Date(appt.appointmentDate).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={`px-2.5 py-1 rounded-full text-[9px] font-black tracking-tighter ${appt.isActive ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                          {appt.isActive ? 'ACTIVE' : 'EXPIRED'}
                        </div>
                        {canEditPermissions && (
                          <button type="button" onClick={() => onEditAppointment(appt)} className="p-1.5 hover:bg-white/10 rounded-lg text-textSecondary hover:text-primary transition-all">
                            <Settings className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>


            <div className="space-y-4 pt-4 border-t border-white/5">
              <h3 className="text-sm font-black text-primary uppercase tracking-widest">Employment Details</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Designation</label>
                  <input type="text" value={formData.designation || ''} onChange={e => setFormData({ ...formData, designation: e.target.value })} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Employment Type</label>
                  <select value={formData.employmentType || ''} onChange={e => setFormData({ ...formData, employmentType: e.target.value })} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50">
                    <option value="Full-time">Full-time</option>
                    <option value="Part-time">Part-time</option>
                    <option value="Contract">Contract</option>
                    <option value="Intern">Intern</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Reporting Manager</label>
                  <select value={formData.reportingManagerId || ''} onChange={e => setFormData({ ...formData, reportingManagerId: e.target.value })} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50">
                    <option value="">None</option>
                    {employees?.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Contract Start</label>
                  <input type="date" value={formData.contractStartDate || ''} onChange={e => setFormData({ ...formData, contractStartDate: e.target.value })} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Contract End</label>
                  <input type="date" value={formData.contractEndDate || ''} onChange={e => setFormData({ ...formData, contractEndDate: e.target.value })} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Assigned Office</label>
                  <input type="text" value={formData.assignedOffice || ''} onChange={e => setFormData({ ...formData, assignedOffice: e.target.value })} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50" />
                </div>
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-white/5">
              <h3 className="text-sm font-black text-primary uppercase tracking-widest">Financial & Compliance</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Bank Details (JSON string)</label>
                  <textarea rows={2} value={formData.bankDetails || ''} onChange={e => setFormData({ ...formData, bankDetails: e.target.value })} placeholder='{"bank": "...", "account": "..."}' className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50 resize-none font-mono" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Tax Information (NTN/STRN)</label>
                  <textarea rows={2} value={formData.taxInformation || ''} onChange={e => setFormData({ ...formData, taxInformation: e.target.value })} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50 resize-none font-mono" />
                </div>
              </div>
            </div>

            {initialData?.id && (
              <div className="space-y-4 pt-4 border-t border-white/5">
                <h3 className="text-sm font-black text-primary uppercase tracking-widest">Asset Assignment</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1 mb-2">Assigned Assets</label>
                    <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                      {assets.length === 0 ? <p className="text-xs text-textSecondary italic">No assets assigned.</p> : assets.map(a => (
                        <div key={a.id} className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/10">
                          <div>
                            <p className="text-xs font-bold">{a.assetName}</p>
                            <p className="text-[10px] text-textSecondary">{a.assetType}</p>
                          </div>
                          <button type="button" onClick={() => handleUnassignAsset(a.id)} className="text-[10px] text-red-400 font-bold px-2 py-1 bg-red-400/10 rounded hover:bg-red-400/20">Remove</button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1 mb-2">Available Assets</label>
                    <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                      {unassignedAssets.length === 0 ? <p className="text-xs text-textSecondary italic">No available assets.</p> : unassignedAssets.map(a => (
                        <div key={a.id} className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/10">
                          <div>
                            <p className="text-xs font-bold">{a.assetName}</p>
                            <p className="text-[10px] text-textSecondary">{a.assetType}</p>
                          </div>
                          <button type="button" onClick={() => handleAssignAsset(a.id)} className="text-[10px] text-primary font-bold px-2 py-1 bg-primary/10 rounded hover:bg-primary/20">Assign</button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-4 gap-4 pt-4 border-t border-white/5">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Status</label>
                <select value={formData.employmentStatus} onChange={e => setFormData({ ...formData, employmentStatus: e.target.value })} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="on_leave">On Leave</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Base Salary</label>
                <input type="number" value={formData.baseSalary || ''} onChange={e => setFormData({ ...formData, baseSalary: Number(e.target.value) })} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50 font-mono" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Efficiency</label>
                <input type="number" step="0.01" value={formData.efficiencyScore || ''} onChange={e => setFormData({ ...formData, efficiencyScore: Number(e.target.value) })} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50 font-mono" />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Sector ID</label>
                <input type="text" value={formData.sectorId || ''} onChange={e => setFormData({ ...formData, sectorId: e.target.value })} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50" />
              </div>
            </div>
            <div className="space-y-3">
              <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Departments</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {DEPARTMENT_OPTIONS.filter(opt => opt.value).map(opt => {
                  const isSelected = ((formData.department || '') || '').split(',').includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        const current = (formData.department || '').split(',').filter(Boolean);
                        const next = isSelected
                          ? current.filter((v: string) => v !== opt.value)
                          : [...current, opt.value];
                        setFormData({ ...formData, department: next.join(',') });
                      }}
                      className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${isSelected
                          ? 'bg-primary/10 border-primary text-primary shadow-lg shadow-primary/10'
                          : 'bg-surface/50 border-white/10 text-textSecondary hover:border-white/20'
                        }`}
                    >
                      <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${isSelected ? 'bg-primary border-primary' : 'border-white/20 bg-black/20'
                        }`}>
                        {isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
                      </div>
                      <span className="text-xs font-bold">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-textSecondary mt-1 italic ml-1">
                {formData.department ? `Assigned to: ${formData.department.split(',').join(', ')}` : 'No departments assigned.'}
              </p>
            </div>
          </div>
        </form>

        <div className="p-6 bg-white/5 border-t border-white/10 flex gap-4">
          <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl border border-white/10 text-xs font-black uppercase tracking-widest text-textSecondary hover:bg-white/5 transition-all">Cancel</button>
          <button onClick={handleSubmit} disabled={loading} className="flex-1 py-3 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-widest hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Record
          </button>
        </div>
      </div>
      {rawImage && <CropModal image={rawImage} onClose={() => setRawImage(null)} onSave={handleSaveCrop} />}
    </div>
  );
}
