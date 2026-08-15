import React, { useState, useEffect } from 'react';
import { User, FileText, Banknote, Calendar, Briefcase, TrendingUp, X, Settings, Eye, Loader2, Trash2 } from 'lucide-react';
import SalarySchemaWizard from './SalarySchemaWizard';
import PaySlip from './PaySlip';
import AssetPreviewModal from './AssetPreviewModal';

const API = '/api';
const token = () => localStorage.getItem('ga_token') || '';

interface EmployeeProfileTabsProps {
  employee: any;
  onClose: () => void;
  onSave?: (data: any) => void;
}

type Tab = 'profile' | 'documents' | 'payroll' | 'attendance' | 'assets' | 'performance';

export default function EmployeeProfileTabs({ employee, onClose, onSave }: EmployeeProfileTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [showSchemaWizard, setShowSchemaWizard] = useState(false);
  const [viewingPaySlip, setViewingPaySlip] = useState<any>(null);
  const [payrollHistory, setPayrollHistory] = useState<any[]>([]);
  const [loadingPayroll, setLoadingPayroll] = useState(false);
  const [documents, setDocuments] = useState<any[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [assets, setAssets] = useState<any[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docType, setDocType] = useState('Resume');
  const [docError, setDocError] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const DOC_TYPES = ['Resume', 'Offer Letter', 'Contract', 'CNIC', 'Degree/Certificate', 'NDA', 'Experience Letter', 'Other'];

  const loadDocuments = async () => {
    if (!employee?.id) return;
    setLoadingDocs(true);
    try {
      const res = await fetch(`${API}/hr/documents?employee_id=${employee.id}`, {
        headers: { Authorization: `Bearer ${token()}` }
      });
      const d = await res.json();
      setDocuments(d.data || []);
    } finally { setLoadingDocs(false); }
  };

  const handleDocumentUpload = async (file: File) => {
    setDocError('');
    setUploadingDoc(true);
    try {
      // 1. Upload file to R2
      const ext = file.name.split('.').pop();
      const r2Key = `employee-docs/${employee.id}/${Date.now()}-${file.name}`;
      const uploadRes = await fetch(`${API}/assets/upload/${r2Key}`, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream', Authorization: `Bearer ${token()}` },
        body: file,
      });
      if (!uploadRes.ok) throw new Error('File upload to storage failed');
      const uploadData = await uploadRes.json();
      const fileUrl = uploadData.data?.url || `/api/assets/download/${r2Key}`;

      // 2. Record in employee_documents table
      const metaRes = await fetch(`${API}/hr/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({
          employeeId: employee.id,
          documentType: docType,
          url: fileUrl,
          uploadDate: new Date().toISOString().split('T')[0],
        }),
      });
      if (!metaRes.ok) throw new Error('Failed to save document record');
      await loadDocuments();
    } catch (err: any) {
      setDocError(err.message || 'Upload failed');
    } finally { setUploadingDoc(false); }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!confirm('Remove this document record?')) return;
    await fetch(`${API}/hr/documents/${docId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token()}` },
    });
    setDocuments(prev => prev.filter(d => d.id !== docId));
  };

  const fileIcon = (url: string) => {
    if (/\.(jpg|jpeg|png|gif|webp)$/i.test(url)) return '🖼️';
    if (/\.pdf$/i.test(url)) return '📄';
    if (/\.(doc|docx)$/i.test(url)) return '📝';
    return '📎';
  };

  useEffect(() => {
    if (activeTab === 'payroll' && employee?.id) {
      setLoadingPayroll(true);
      fetch(`${API}/hr/payroll?employee_id=${employee.id}`, {
        headers: { Authorization: `Bearer ${token()}` }
      })
        .then(r => r.json()).then(d => setPayrollHistory(d.data || [])).finally(() => setLoadingPayroll(false));
    }
    if (activeTab === 'attendance' && employee?.id) {
      setLoadingAttendance(true);
      fetch(`${API}/hr/attendance?employee_id=${employee.id}`, { headers: { Authorization: `Bearer ${token()}` } })
        .then(r => r.json()).then(d => setAttendanceRecords((d.data || []).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()))).finally(() => setLoadingAttendance(false));
    }
    if (activeTab === 'assets' && employee?.id) {
      setLoadingAssets(true);
      fetch(`${API}/hr/assets?assigned_to=${employee.id}`, { headers: { Authorization: `Bearer ${token()}` } })
        .then(r => r.json()).then(d => setAssets(d.data || [])).finally(() => setLoadingAssets(false));
    }
    if (activeTab === 'documents') loadDocuments();
  }, [activeTab, employee?.id]);

  const fmt = (n: number) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  
  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'documents', label: 'Documents', icon: FileText },
    { id: 'payroll', label: 'Payroll', icon: Banknote },
    { id: 'attendance', label: 'Attendance', icon: Calendar },
    { id: 'assets', label: 'Assets', icon: Briefcase },
    { id: 'performance', label: 'Performance', icon: TrendingUp },
  ];

  return (<>
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md p-4" onClick={onClose}>
      <div className="glass-panel rounded-3xl w-full max-w-5xl max-h-[90vh] overflow-hidden shadow-2xl border border-white/20 animate-in fade-in zoom-in duration-200 flex flex-col" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/5 shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary overflow-hidden">
              {employee?.profilePhoto ? (
                <img src={employee.profilePhoto} alt={employee.name} className="w-full h-full object-cover" />
              ) : (
                employee?.name?.charAt(0) || 'U'
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">{employee?.name || 'New Employee'}</h2>
              <p className="text-xs text-textSecondary uppercase tracking-widest">{employee?.designation || 'Employee'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-textSecondary"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar Tabs */}
          <div className="w-48 border-r border-white/10 bg-black/20 p-4 space-y-2 overflow-y-auto">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-bold ${
                  activeTab === t.id ? 'bg-primary/20 text-primary border border-primary/20 shadow-lg shadow-primary/10' : 'text-textSecondary hover:bg-white/5 hover:text-white'
                }`}
              >
                <t.icon className="w-4 h-4" />
                {t.label}
              </button>
            ))}
          </div>

          {/* Main Content Area */}
          <div className="flex-1 p-8 overflow-y-auto custom-scrollbar bg-surface/30">
            
            {activeTab === 'profile' && (
              <div className="space-y-6">
                <h3 className="text-lg font-bold text-white mb-4">Personal Information</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Full Name</label>
                    <input type="text" readOnly value={employee?.name || ''} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Email</label>
                    <input type="email" readOnly value={employee?.email || ''} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">CNIC / National ID</label>
                    <input type="text" readOnly value={employee?.cnic || ''} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Phone</label>
                    <input type="text" readOnly value={employee?.phone || ''} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Date of Birth</label>
                    <input type="date" readOnly value={employee?.dob || ''} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Emergency Contact</label>
                    <input type="text" readOnly value={employee?.emergencyContact || ''} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none" />
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Address</label>
                    <textarea rows={2} readOnly value={employee?.address || ''} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none resize-none" />
                  </div>
                </div>
                
                <h3 className="text-lg font-bold text-white mb-4 mt-8">Employment Details</h3>
                <div className="grid grid-cols-3 gap-6">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Designation</label>
                    <input type="text" readOnly value={employee?.designation || ''} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Department</label>
                    <input type="text" readOnly value={employee?.department || ''} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Employment Type</label>
                    <input type="text" readOnly value={employee?.employmentType || ''} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Joining Date</label>
                    <input type="date" readOnly value={employee?.hireDate || ''} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Contract Start</label>
                    <input type="date" readOnly value={employee?.contractStartDate || ''} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Contract End</label>
                    <input type="date" readOnly value={employee?.contractEndDate || ''} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Assigned Office</label>
                    <input type="text" readOnly value={employee?.assignedOffice || ''} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none" />
                  </div>
                </div>

                <h3 className="text-lg font-bold text-white mb-4 mt-8">Financial & Compliance</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Bank Details</label>
                    <textarea rows={2} readOnly value={employee?.bankDetails || ''} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none resize-none font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Tax Information (NTN/STRN)</label>
                    <textarea rows={2} readOnly value={employee?.taxInformation || ''} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none resize-none font-mono" />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'documents' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-white">Employee Documents</h3>
                </div>

                {/* Upload area */}
                <div className="p-5 rounded-2xl border border-white/10 bg-white/5 space-y-3">
                  <p className="text-[10px] font-black text-textSecondary uppercase tracking-widest">Upload New Document</p>
                  <div className="flex items-center gap-3 flex-wrap">
                    <select
                      value={docType}
                      onChange={e => setDocType(e.target.value)}
                      className="bg-surface/50 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none flex-1 min-w-[160px]"
                    >
                      {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <label className={`relative flex items-center gap-2 px-5 py-2 rounded-xl font-bold text-xs cursor-pointer transition-all ${
                      uploadingDoc
                        ? 'bg-white/5 text-textSecondary border border-white/10 cursor-not-allowed'
                        : 'bg-primary text-white hover:opacity-90 border border-primary'
                    }`}>
                      {uploadingDoc ? (
                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading...</>
                      ) : (
                        <><FileText className="w-3.5 h-3.5" /> Choose File & Upload</>
                      )}
                      {!uploadingDoc && (
                        <input
                          type="file"
                          className="absolute inset-0 opacity-0 cursor-pointer"
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleDocumentUpload(f); e.target.value = ''; }}
                        />
                      )}
                    </label>
                  </div>
                  {docError && <p className="text-xs text-red-400 font-bold">{docError}</p>}
                </div>

                {/* Document list */}
                {loadingDocs ? (
                  <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
                ) : documents.length === 0 ? (
                  <div className="p-8 rounded-2xl border border-dashed border-white/10 bg-white/5 text-center">
                    <FileText className="w-8 h-8 mx-auto mb-3 opacity-20 text-white" />
                    <p className="text-xs text-textSecondary italic">No documents uploaded yet. Use the form above to add the first one.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {documents.map(doc => (
                      <div key={doc.id} className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10 hover:border-primary/30 transition-all group">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-lg shrink-0">
                            {fileIcon(doc.url)}
                          </div>
                          <div>
                            <p className="font-bold text-sm">{doc.documentType}</p>
                            <p className="text-xs text-textSecondary">{doc.uploadDate}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setPreviewUrl(`${doc.url}${doc.url.includes('?') ? '&' : '?'}token=${token()}`)}
                            className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-all"
                          >
                            View
                          </button>
                          <button
                            onClick={() => handleDeleteDocument(doc.id)}
                            className="p-1.5 text-textSecondary hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'payroll' && (
              <div className="space-y-6">
                {/* Salary schema configure button */}
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-white">Salary Schema</h3>
                  <button
                    onClick={() => setShowSchemaWizard(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 text-primary border border-primary/20 text-xs font-bold hover:bg-primary/20 transition-all"
                  >
                    <Settings className="w-3.5 h-3.5" /> Configure Schema
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Base Salary</label>
                    <input type="text" readOnly value={fmt(employee?.baseSalary || 0)} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Tax Information</label>
                    <input type="text" readOnly value={employee?.taxInformation || 'Not Provided'} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none" />
                  </div>
                </div>

                <div className="pt-4 border-t border-white/10">
                  <h3 className="text-base font-bold text-white mb-4">Payroll History</h3>
                  {loadingPayroll ? (
                    <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
                  ) : payrollHistory.length === 0 ? (
                    <div className="p-8 rounded-2xl border border-dashed border-white/10 bg-white/5 text-center">
                      <Banknote className="w-8 h-8 mx-auto mb-3 opacity-20 text-white" />
                      <p className="text-xs text-textSecondary italic">No payroll records found. Run payroll from the Payroll tab.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {payrollHistory.map(record => (
                        <div key={record.id} className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10 hover:border-primary/30 transition-all group">
                          <div>
                            <p className="font-bold text-sm">{record.payrollMonth}</p>
                            <p className="text-xs text-textSecondary mt-0.5">Gross: {fmt(record.grossSalary)} · Deductions: {fmt((record.withholdingTax || 0) + (record.otherDeductions || 0))}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <p className="font-black text-green-400 font-mono">{fmt(record.netPay)}</p>
                            <select
                              value={record.disbursementStatus}
                              onChange={async (e) => {
                                const newStatus = e.target.value;
                                setPayrollHistory(prev => prev.map(r => r.id === record.id ? { ...r, disbursementStatus: newStatus } : r));
                                try {
                                  const res = await fetch(`${API}/hr/payroll/${record.id}`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                                    body: JSON.stringify({ disbursementStatus: newStatus }),
                                  });
                                  if (!res.ok) throw new Error();
                                } catch {
                                  setPayrollHistory(prev => prev.map(r => r.id === record.id ? { ...r, disbursementStatus: record.disbursementStatus } : r));
                                }
                              }}
                              className={`bg-surface/50 border border-white/10 rounded-lg px-2 py-1 text-[10px] focus:outline-none font-bold ${
                                record.disbursementStatus === 'paid' ? 'text-green-400' : record.disbursementStatus === 'processed' ? 'text-blue-400' : 'text-yellow-400'
                              }`}
                            >
                              <option value="pending" className="bg-background text-yellow-400">Pending</option>
                              <option value="processed" className="bg-background text-blue-400">Processed</option>
                              <option value="paid" className="bg-background text-green-400">Paid</option>
                            </select>
                            <button
                              onClick={() => setViewingPaySlip(record)}
                              className="p-2 text-textSecondary hover:text-primary hover:bg-primary/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                              title="View Pay Slip"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'attendance' && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-white mb-4">Attendance & Leaves</h3>
                <div className="grid grid-cols-3 gap-4 mb-6">
                   <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                     <p className="text-2xl font-black text-green-400">{attendanceRecords.filter(r => r.status === 'Present').length}</p>
                     <p className="text-[10px] uppercase tracking-widest text-textSecondary font-bold mt-1">Days Present</p>
                   </div>
                   <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                     <p className="text-2xl font-black text-yellow-400">{attendanceRecords.reduce((acc, r) => acc + (r.totalHours || 0), 0).toFixed(1)}</p>
                     <p className="text-[10px] uppercase tracking-widest text-textSecondary font-bold mt-1">Total Hours Recorded</p>
                   </div>
                   <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                     <p className="text-2xl font-black text-red-400">{attendanceRecords.filter(r => r.status === 'Absent' || r.status === 'Late').length}</p>
                     <p className="text-[10px] uppercase tracking-widest text-textSecondary font-bold mt-1">Late/Absent Records</p>
                   </div>
                </div>
                {loadingAttendance ? (
                  <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
                ) : attendanceRecords.length === 0 ? (
                  <div className="p-8 rounded-2xl border border-dashed border-white/10 bg-white/5 text-center">
                    <Calendar className="w-8 h-8 mx-auto mb-3 opacity-20 text-white" />
                    <p className="text-xs text-textSecondary italic">No attendance records found.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {attendanceRecords.map(record => (
                      <div key={record.id} className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10">
                        <div>
                          <p className="font-bold text-sm">{new Date(record.date).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</p>
                          <p className="text-xs text-textSecondary mt-0.5">
                            {record.checkIn ? `In: ${record.checkIn}` : 'No check-in'} 
                            {record.checkOut ? ` · Out: ${record.checkOut}` : ''}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`text-xs font-bold ${record.status === 'Present' ? 'text-green-400' : 'text-yellow-400'}`}>{record.status}</p>
                          {record.totalHours && <p className="text-[10px] text-textSecondary mt-1">{record.totalHours} hrs</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'assets' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-bold text-white">Assigned Assets</h3>
                  <button onClick={() => onClose()} className="px-4 py-2 bg-primary/20 text-primary font-bold text-xs rounded-full border border-primary/20 hover:bg-primary/30 transition-all">Edit from main form</button>
                </div>
                {loadingAssets ? (
                  <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
                ) : assets.length === 0 ? (
                  <div className="p-8 rounded-2xl border border-dashed border-white/10 bg-white/5 text-center">
                    <Briefcase className="w-8 h-8 mx-auto mb-3 opacity-20 text-white" />
                    <p className="text-xs text-textSecondary italic">No assets assigned to this employee.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {assets.map(asset => (
                      <div key={asset.id} className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10">
                        <div>
                          <p className="font-bold text-sm">{asset.assetName}</p>
                          <p className="text-xs text-textSecondary mt-0.5">{asset.assetType}</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-[10px] font-black uppercase tracking-widest ${asset.status === 'Assigned' ? 'text-primary' : 'text-yellow-400'}`}>{asset.status}</p>
                          {asset.issueDate && <p className="text-[10px] text-textSecondary mt-1">Issued: {asset.issueDate}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'performance' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-bold text-white">Performance Reviews</h3>
                  <button className="px-4 py-2 bg-primary/20 text-primary font-bold text-xs rounded-full border border-primary/20 hover:bg-primary/30 transition-all">+ Add Review</button>
                </div>
                <div className="p-8 rounded-2xl border border-dashed border-white/10 bg-white/5 text-center">
                  <TrendingUp className="w-8 h-8 mx-auto mb-3 opacity-20 text-white" />
                  <p className="text-xs text-textSecondary italic">No performance reviews recorded.</p>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>

    {showSchemaWizard && employee && (
      <SalarySchemaWizard
        employee={employee}
        onClose={() => setShowSchemaWizard(false)}
        onSaved={() => { setShowSchemaWizard(false); }}
      />
    )}

    {viewingPaySlip && (
      <PaySlip
        record={viewingPaySlip}
        employee={employee}
        onClose={() => setViewingPaySlip(null)}
      />
    )}

    {previewUrl && (
      <AssetPreviewModal
        url={previewUrl}
        onClose={() => setPreviewUrl(null)}
        type={previewUrl && /\.(pdf)(\?|$)/i.test(previewUrl) ? 'pdf' : 'image'}
      />
    )}
  </>);
}
