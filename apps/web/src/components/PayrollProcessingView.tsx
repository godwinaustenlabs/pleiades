import React, { useState } from 'react';
import { Play, Download, CheckCircle2, AlertCircle, FileText, Loader2 } from 'lucide-react';

const API = '/api';
const token = () => localStorage.getItem('ga_token') || '';
const fmt = (n: number) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

interface PayrollProcessingViewProps {
  employees: any[];
  onPayrollGenerated?: () => void;
}

interface PayrollResult {
  employeeId: string;
  name: string;
  netPay: number;
  status: string;
}

export default function PayrollProcessingView({ employees, onPayrollGenerated }: PayrollProcessingViewProps) {
  const [step, setStep] = useState(1);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [results, setResults] = useState<PayrollResult[]>([]);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const handlePreviewPayroll = async () => {
    setError('');
    setLoadingPreview(true);
    try {
      // Fetch calculated salary for each employee in parallel (batch of 10)
      const active = employees.filter(e => e.employmentStatus === 'active').slice(0, 20);
      const previews = await Promise.all(
        active.map(emp =>
          fetch(`${API}/hr/salary-structures/${emp.id}/calculate`, {
            headers: { Authorization: `Bearer ${token()}` }
          }).then(r => r.json()).then(d => d.data || { employeeId: emp.id, employeeName: emp.name, baseSalary: emp.baseSalary || 0, grossSalary: emp.baseSalary || 0, totalDeductions: 0, netPay: emp.baseSalary || 0 })
        )
      );
      setPreviewData(previews);
      setStep(2);
    } catch (err: any) {
      setError(err.message || 'Failed to preview payroll');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleGeneratePayroll = async () => {
    setError('');
    setProcessing(true);
    try {
      const res = await fetch(`${API}/hr/payroll/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ month }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Payroll generation failed');
      setResults(d.data?.results || []);
      setStep(3);
      onPayrollGenerated?.();
    } catch (err: any) {
      setError(err.message || 'Failed to generate payroll');
    } finally {
      setProcessing(false);
    }
  };

  const totalNetPay = previewData.reduce((s, e) => s + (e.netPay || 0), 0);
  const totalGross = previewData.reduce((s, e) => s + (e.grossSalary || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-2xl font-bold">Run Monthly Payroll</h2>
        <div className="flex items-center gap-2 text-xs font-bold text-textSecondary uppercase tracking-widest">
          {[1, 2, 3].map((s, i) => (
            <React.Fragment key={s}>
              <span className={step >= s ? 'text-primary' : ''}>
                {s === 1 ? 'Configure' : s === 2 ? 'Review' : 'Generate'}
              </span>
              {i < 2 && <span className="text-white/20">→</span>}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* STEP 1: Configure */}
      {step === 1 && (
        <div className="glass-panel p-8 rounded-3xl border border-white/10 max-w-2xl mx-auto space-y-8 animate-in fade-in zoom-in duration-300">
          <div className="text-center space-y-2">
            <h3 className="text-xl font-bold">Payroll Configuration</h3>
            <p className="text-sm text-textSecondary">Select the month and preview calculated salaries before running.</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Payroll Month</label>
              <input
                type="month"
                value={month}
                onChange={e => setMonth(e.target.value)}
                className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50"
              />
            </div>

            <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm flex gap-3 items-start">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold mb-1">How it works</p>
                <p className="text-xs leading-relaxed">The system reads each employee's <strong>active salary schema</strong> — base salary + allowances − deductions + active loan installments — and calculates their net pay in real time. Employees without a salary schema will use their base salary with no deductions.</p>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-bold">
                <AlertCircle className="w-4 h-4 shrink-0" /> {error}
              </div>
            )}
          </div>

          <button
            onClick={handlePreviewPayroll}
            disabled={loadingPreview}
            className="w-full py-4 rounded-xl bg-primary text-white font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loadingPreview
              ? <><Loader2 className="w-5 h-5 animate-spin" /> Calculating salaries...</>
              : <><Play className="w-5 h-5" /> Preview Payroll for {month}</>
            }
          </button>
        </div>
      )}

      {/* STEP 2: Review */}
      {step === 2 && (
        <div className="space-y-6 animate-in fade-in zoom-in duration-300">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="glass-panel p-5 rounded-2xl border border-white/10 text-center">
              <p className="text-[10px] text-textSecondary uppercase tracking-widest font-bold">Employees</p>
              <p className="text-3xl font-black mt-1">{previewData.length}</p>
            </div>
            <div className="glass-panel p-5 rounded-2xl border border-white/10 text-center">
              <p className="text-[10px] text-textSecondary uppercase tracking-widest font-bold">Total Gross</p>
              <p className="text-2xl font-black mt-1 font-mono">{fmt(totalGross)}</p>
            </div>
            <div className="glass-panel p-5 rounded-2xl border border-primary/20 bg-primary/5 text-center">
              <p className="text-[10px] text-textSecondary uppercase tracking-widest font-bold">Total Net Pay</p>
              <p className="text-2xl font-black mt-1 font-mono text-primary">{fmt(totalNetPay)}</p>
            </div>
          </div>

          <div className="rounded-3xl overflow-hidden border border-white/10 bg-white/[0.02]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-white/5 border-b border-white/10">
                  <tr>
                    <th className="px-4 py-3 text-[10px] font-black text-textSecondary uppercase tracking-widest">Employee</th>
                    <th className="px-4 py-3 text-[10px] font-black text-textSecondary uppercase tracking-widest">Base</th>
                    <th className="px-4 py-3 text-[10px] font-black text-textSecondary uppercase tracking-widest text-green-400">Gross</th>
                    <th className="px-4 py-3 text-[10px] font-black text-textSecondary uppercase tracking-widest text-red-400">Deductions</th>
                    <th className="px-4 py-3 text-[10px] font-black text-textSecondary uppercase tracking-widest text-right">Net Pay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {previewData.map(emp => (
                    <tr key={emp.employeeId} className="hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 font-bold">{emp.employeeName}</td>
                      <td className="px-4 py-3 font-mono text-textSecondary">{fmt(emp.baseSalary)}</td>
                      <td className="px-4 py-3 font-mono text-green-400">{fmt(emp.grossSalary)}</td>
                      <td className="px-4 py-3 font-mono text-red-400">− {fmt(emp.totalDeductions)}</td>
                      <td className="px-4 py-3 font-mono font-black text-white text-right">{fmt(emp.netPay)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-bold">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}

          <div className="flex gap-4">
            <button onClick={() => { setStep(1); setPreviewData([]); }} className="flex-1 py-4 rounded-xl bg-white/5 border border-white/10 font-bold hover:bg-white/10 transition-all">
              ← Reconfigure
            </button>
            <button
              onClick={handleGeneratePayroll}
              disabled={processing}
              className="flex-1 py-4 rounded-xl bg-primary text-white font-bold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {processing ? <><Loader2 className="w-5 h-5 animate-spin" /> Generating...</> : 'Confirm & Generate Payroll →'}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Done */}
      {step === 3 && (
        <div className="space-y-6 animate-in fade-in zoom-in duration-300">
          <div className="glass-panel p-8 rounded-3xl border border-green-500/20 bg-green-500/5 text-center max-w-xl mx-auto space-y-4">
            <CheckCircle2 className="w-14 h-14 text-green-400 mx-auto" />
            <h3 className="text-xl font-bold">Payroll Generated!</h3>
            <p className="text-sm text-textSecondary">
              {results.filter(r => r.status === 'generated').length} payroll records created for <strong className="text-white">{month}</strong>.
              {' '}Pay slips can be viewed in each employee's profile.
            </p>
            <button onClick={() => setStep(1)} className="px-8 py-3 rounded-xl bg-white/5 border border-white/10 font-bold text-sm hover:bg-white/10 transition-all mt-2">
              Run Another Month
            </button>
          </div>

          {/* Result list */}
          <div className="rounded-3xl overflow-hidden border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/5 border-b border-white/10">
                <tr>
                  <th className="text-left px-4 py-3 text-[10px] font-black text-textSecondary uppercase tracking-widest">Employee</th>
                  <th className="text-right px-4 py-3 text-[10px] font-black text-textSecondary uppercase tracking-widest">Net Pay</th>
                  <th className="text-right px-4 py-3 text-[10px] font-black text-textSecondary uppercase tracking-widest">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {results.map((r, i) => (
                  <tr key={i} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-bold">{r.name}</td>
                    <td className="px-4 py-3 text-right font-mono text-green-400 font-bold">{fmt(r.netPay)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${
                        r.status === 'generated' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'
                      }`}>{r.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-4">
            <button className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 font-bold hover:bg-white/10 transition-all flex items-center justify-center gap-2 text-sm">
              <Download className="w-4 h-4" /> Export Register (CSV)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
