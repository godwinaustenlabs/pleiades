import { useState, useEffect, useMemo } from 'react';
import {
  Users, Shield, Activity, LogOut,
  Key, Settings, BarChart3, Plus, Loader2, Save, X, Home, Lock
} from 'lucide-react';
import Login from './Login';
import GanovaGrid, { type Column } from '../components/GanovaGrid';

import TaskBoard from '../components/TaskBoard';
import AppointmentProvisionForm from '../components/AppointmentProvisionForm';
import ProfileModal from '../components/ProfileModal';

const API = '/api';
const token = () => localStorage.getItem('ganova_token') || '';

type Tab = 'directory' | 'payroll' | 'appointments' | 'committees' | 'tasks' | 'resets';

const DEPARTMENT_OPTIONS = [
  { value: '', label: 'None (e.g. CEO)' },
  { value: 'HR', label: 'HR' },
  { value: 'Finance', label: 'Finance' },
  { value: 'Tech', label: 'Tech' },
  { value: 'Legal', label: 'Legal' },
  { value: 'Ops', label: 'Ops' },
  { value: 'Acquisition', label: 'Acquisition' },
];

interface UserPermission {
  appName: string;
  feature: string;
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

function HR() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!token());
  const [tab, setTab] = useState<Tab>('directory');
  const [showProfile, setShowProfile] = useState(false);
  const [showEntityForm, setShowEntityForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [committees, setCommittees] = useState<any[]>([]);

  const [showAppointmentForm, setShowAppointmentForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Granular Permissions
  const [userPermissions, setUserPermissions] = useState<UserPermission[]>([]);
  const [permsLoaded, setPermsLoaded] = useState(false);

  const user = useMemo(() => JSON.parse(localStorage.getItem('ganova_user') || '{}'), []);

  const handleLogout = () => {
    localStorage.clear();
    setIsAuthenticated(false);
  };

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


  useEffect(() => {
    if (isAuthenticated) {
      fetchPermissions();
    }
  }, [isAuthenticated]);

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
      { id: 'directory', label: 'Directory', icon: Users, feature: 'employees' },
      { id: 'appointments', label: 'Appointments', icon: Shield, feature: 'appointments' },
      { id: 'committees', label: 'Committees', icon: Users, feature: 'employees' }, // shared with employees for HR
      { id: 'payroll', label: 'Payroll', icon: BarChart3, feature: 'payroll' },
      { id: 'tasks', label: 'Tasks', icon: Activity, feature: 'tasks' },
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

  const employeeColumns: Column[] = [
    { key: 'name', label: 'Name', type: 'avatar' },
    { key: 'id', label: 'Employee ID' },
    { key: 'slackId', label: 'Slack ID', type: 'badge' },
    { key: 'department', label: 'Department', type: 'badge' },
    {
      key: 'role', label: 'Primary Role', render: (_v: any, record: any) => {
        const appt = appointments.find(a => a.employeeId === record.id && a.isActive);
        return appt ? appt.roleOrTitle : <span className="text-textSecondary italic">No active role</span>;
      }
    },
    { key: 'employmentStatus', label: 'Status', type: 'status' },
    { key: 'baseSalary', label: 'Salary', type: 'currency' },
  ];

  const handleEmployeeSubmit = async (data: any) => {
    const method = editingRecord ? 'PATCH' : 'POST';
    const url = editingRecord ? `${API}/core/employees/${editingRecord.id}` : `${API}/core/employees`;
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify(data),
    });
    if (res.status === 401) { handleLogout(); return; }
    if (!res.ok) throw new Error('Failed to save employee');
    setShowEntityForm(false);
    setEditingRecord(null);
    fetchEmployees();
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
    if (!confirm(`CRITICAL WARNING: This will PERMANENTLY DELETE the employee "${record.name}". Are you sure?`)) return;
    const res = await fetch(`${API}/core/employees/${record.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token()}` },
    });
    if (res.status === 401) { handleLogout(); return; }
    fetchEmployees();
  };

  return (
    <div className="min-h-screen flex flex-col bg-background font-sans text-textPrimary animate-in fade-in duration-700">
      <header className="glass-panel sticky top-0 z-50 px-8 py-4 flex items-center justify-between border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="bg-primary/20 p-2 rounded-xl">
            <Activity className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight leading-none">GAnova<span className="text-primary">OS</span></h1>
            <span className="text-[10px] uppercase tracking-[0.2em] text-textSecondary font-bold">HR Management</span>
          </div>
          <button onClick={() => window.location.href = '/'} className="ml-2 p-2 text-textSecondary hover:text-primary hover:bg-primary/10 rounded-xl transition-all">
            <Home className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-4">
          <button onClick={() => setShowProfile(true)} className="flex items-center gap-3 pl-2 pr-4 py-1.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all group">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center font-bold text-xs shadow-lg shadow-primary/20">
              {user.name?.charAt(0) || user.email?.charAt(0).toUpperCase()}
            </div>
            <div className="text-left hidden sm:block">
              <div className="text-xs font-bold leading-none mb-0.5">{user.name || user.username || 'User'}</div>
              <div className="text-[10px] text-textSecondary leading-none uppercase tracking-wider">{user.roleName || 'Employee'}</div>
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
              className={`flex items-center gap-2 px-6 py-4 text-xs font-black border-b-2 transition-all uppercase tracking-widest whitespace-nowrap ${tab === t.id
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-textSecondary hover:text-textPrimary hover:bg-white/5'
                }`}>
              <t.icon className={`w-3.5 h-3.5 ${tab === t.id ? 'text-primary' : 'text-textSecondary'}`} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 p-8 max-w-7xl mx-auto w-full space-y-8 animate-in slide-in-from-bottom-2 duration-500">
        {tab === 'directory' && (
          <GanovaGrid
            title="Employee Directory"
            entityName="employee"
            columns={employeeColumns}
            data={employees}
            loading={loading}
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
          <div className="glass-panel rounded-3xl p-20 text-center space-y-4 border border-white/10">
            <BarChart3 className="w-16 h-16 mx-auto text-primary opacity-20" />
            <h3 className="text-xl font-bold">Payroll Engine</h3>
            <p className="text-textSecondary max-w-md mx-auto text-sm">Automated payroll distribution and tax calculations are being synchronized.</p>
          </div>
        )}

        {tab === 'appointments' && (
          <GanovaGrid
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
          <GanovaGrid
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

      {showEntityForm && (
        <EmployeeForm
          initialData={editingRecord}
          appointments={appointments.filter(a => a.employeeId === editingRecord?.id)}
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
    </div>
  );
}

export default HR;

/* ── SPECIALIZED EMPLOYEE FORM ── */
interface EmployeeFormProps {
  initialData: any;
  appointments: any[];
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
  onAddAppointment: () => void;
  onEditAppointment: (appt: any) => void;
  canEditPermissions?: boolean;
}

function EmployeeForm({ initialData, appointments, onClose, onSubmit, onAddAppointment, onEditAppointment, canEditPermissions }: EmployeeFormProps) {
  const [formData, setFormData] = useState(initialData || { name: '', department: '', employmentStatus: 'active', profilePhoto: null, slackId: '', hireDate: '', baseSalary: 0, efficiencyScore: 0, sectorId: '' });
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    setError('');
    try {
      const token = localStorage.getItem('ganova_token') || '';
      const r2Key = `profiles/${Date.now()}_${file.name}`;
      const res = await fetch(`/api/assets/upload/${r2Key}`, {
        method: 'PUT',
        headers: { 'Content-Type': file.type, Authorization: `Bearer ${token}` },
        body: file
      });
      if (!res.ok) throw new Error('Upload failed');
      const d = await res.json();
      setFormData({ ...formData, profilePhoto: d.data.url });
    } catch (err) { setError('Photo upload failed'); }
    finally { setUploading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try { await onSubmit(formData); } catch (err) { alert('Error saving'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md p-4" onClick={onClose}>
      <div className="glass-panel rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl border border-white/20 animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/5">
          <h2 className="text-xl font-bold text-white">{initialData ? 'Edit Profile' : 'Create Profile'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-textSecondary"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 overflow-y-auto max-h-[80vh] space-y-8 custom-scrollbar">
          {error && <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-bold">{error}</div>}
          
          <div className="flex items-center gap-8">
            <div className="relative group">
              <div className="w-24 h-24 rounded-[2rem] overflow-hidden bg-white/5 border border-white/10 group-hover:border-primary/50 transition-all">
                {formData.profilePhoto ? (
                  <img src={formData.profilePhoto} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-textSecondary"><Users className="w-8 h-8 opacity-20" /></div>
                )}
              </div>
              <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0])} />
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
          <div className="space-y-1.5">
            <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Departments (Hold Cmd/Ctrl for multiple)</label>
            <select 
              multiple
              value={Array.isArray(formData.department) ? formData.department : (formData.department ? formData.department.split(',') : [])} 
              onChange={e => {
                const values = Array.from(e.target.selectedOptions, option => option.value);
                setFormData({ ...formData, department: values.join(',') });
              }} 
              className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50 min-h-[100px]"
            >
              {DEPARTMENT_OPTIONS.filter(opt => opt.value).map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <p className="text-[10px] text-textSecondary mt-1 italic ml-1">Current selection: {formData.department || 'None'}</p>
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
    </div>
  );
}
