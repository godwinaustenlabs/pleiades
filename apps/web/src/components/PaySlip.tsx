import React, { useRef } from 'react';
import { X, Printer, TrendingUp, TrendingDown } from 'lucide-react';

interface PaySlipProps {
  record: {
    payrollMonth: string;
    grossSalary: number;
    netPay: number;
    withholdingTax?: number;
    otherDeductions?: number;
    bonuses?: number;
    disbursementStatus: string;
    financeReference?: string;
    allowancesBreakdown?: string; // JSON
    deductionsBreakdown?: string; // JSON
  };
  employee: {
    name: string;
    designation?: string;
    department?: string;
    email?: string;
    id: string;
  };
  onClose: () => void;
}

const fmt = (n: number) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

export default function PaySlip({ record, employee, onClose }: PaySlipProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const earnings: { name: string; amount: number }[] = (() => {
    try { return JSON.parse(record.allowancesBreakdown || '[]'); } catch { return []; }
  })();

  const deductions: { name: string; amount: number }[] = (() => {
    try { return JSON.parse(record.deductionsBreakdown || '[]'); } catch { return []; }
  })();

  // Fallback if no breakdown stored
  const displayEarnings = earnings.length > 0 ? earnings : [
    { name: 'Basic Salary', amount: record.grossSalary - (record.bonuses || 0) }
  ];
  const displayDeductions = deductions.length > 0 ? deductions : [
    ...(record.withholdingTax ? [{ name: 'Withholding Tax', amount: record.withholdingTax }] : []),
    ...(record.otherDeductions ? [{ name: 'Other Deductions', amount: record.otherDeductions }] : []),
  ];

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Pay Slip — ${employee.name} — ${record.payrollMonth}</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Segoe UI', system-ui, sans-serif; background: #fff; color: #111; padding: 40px; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 16px; margin-bottom: 24px; }
            .company { font-size: 22px; font-weight: 900; letter-spacing: -0.5px; }
            .slip-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #666; margin-top: 4px; }
            .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
            .meta-block { }
            .meta-label { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: #888; }
            .meta-value { font-size: 14px; font-weight: 700; margin-top: 2px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
            th { font-size: 9px; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 800; color: #888; padding: 8px 12px; text-align: left; background: #f5f5f5; border-bottom: 1px solid #e0e0e0; }
            td { padding: 8px 12px; font-size: 13px; border-bottom: 1px solid #f0f0f0; }
            .amount { text-align: right; font-family: monospace; font-weight: 700; }
            .green { color: #16a34a; }
            .red { color: #dc2626; }
            .net-pay-row { background: #111; color: white; }
            .net-pay-row td { padding: 14px 12px; font-size: 16px; font-weight: 900; }
            .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e0e0e0; display: flex; justify-content: space-between; font-size: 11px; color: #888; }
          </style>
        </head>
        <body>${content.innerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onClick={onClose}>
      <div className="bg-background rounded-3xl w-full max-w-2xl max-h-[92vh] overflow-hidden shadow-2xl border border-white/20 animate-in fade-in zoom-in duration-200 flex flex-col" onClick={e => e.stopPropagation()}>
        
        {/* Modal controls */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-white/5 shrink-0">
          <div>
            <h2 className="text-base font-bold">Pay Slip</h2>
            <p className="text-[10px] text-textSecondary uppercase tracking-widest">{record.payrollMonth}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:opacity-90 transition-all">
              <Printer className="w-3.5 h-3.5" /> Print / PDF
            </button>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-textSecondary transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Pay slip body */}
        <div className="overflow-y-auto custom-scrollbar flex-1 p-6">
          <div ref={printRef} className="space-y-6">
            
            {/* Header */}
            <div className="header flex items-start justify-between pb-5 border-b border-white/10">
              <div>
                <p className="text-xl font-black tracking-tight">Godwin Austen Labs</p>
                <p className="text-[10px] uppercase tracking-[0.2em] text-textSecondary font-bold mt-1">Pay Slip · {record.payrollMonth}</p>
              </div>
              <div className="text-right">
                <div className={`inline-flex px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                  record.disbursementStatus === 'paid' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                  record.disbursementStatus === 'processed' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                  'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                }`}>
                  {record.disbursementStatus}
                </div>
                {record.financeReference && (
                  <p className="text-[10px] text-textSecondary mt-1.5 font-mono">Ref: {record.financeReference}</p>
                )}
              </div>
            </div>

            {/* Employee info */}
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-[9px] font-black text-textSecondary uppercase tracking-widest mb-0.5">Employee</p>
                <p className="font-black text-base">{employee.name}</p>
                {employee.designation && <p className="text-xs text-textSecondary mt-0.5">{employee.designation}</p>}
                {employee.email && <p className="text-xs text-textSecondary">{employee.email}</p>}
              </div>
              <div className="text-right">
                <p className="text-[9px] font-black text-textSecondary uppercase tracking-widest mb-0.5">Department</p>
                <p className="font-bold">{employee.department || '—'}</p>
                <p className="text-[9px] font-black text-textSecondary uppercase tracking-widest mb-0.5 mt-2">Employee ID</p>
                <p className="font-mono text-xs text-textSecondary">{employee.id.substring(0, 12)}...</p>
              </div>
            </div>

            {/* Earnings table */}
            <div className="rounded-2xl overflow-hidden border border-green-500/20">
              <div className="bg-green-500/10 px-4 py-2.5 flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5 text-green-400" />
                <span className="text-[10px] font-black text-green-400 uppercase tracking-widest">Earnings</span>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-left px-4 py-2 text-[9px] font-black text-textSecondary uppercase tracking-widest">Component</th>
                    <th className="text-right px-4 py-2 text-[9px] font-black text-textSecondary uppercase tracking-widest">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {displayEarnings.map((e, i) => (
                    <tr key={i} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-2.5 text-sm">{e.name}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-green-400">{fmt(e.amount)}</td>
                    </tr>
                  ))}
                  <tr className="bg-green-500/5 border-t border-green-500/20">
                    <td className="px-4 py-3 text-sm font-black uppercase tracking-widest">Gross Salary</td>
                    <td className="px-4 py-3 text-right font-mono font-black text-green-400 text-base">{fmt(record.grossSalary)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Deductions table */}
            {displayDeductions.length > 0 && (
              <div className="rounded-2xl overflow-hidden border border-red-500/20">
                <div className="bg-red-500/10 px-4 py-2.5 flex items-center gap-2">
                  <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                  <span className="text-[10px] font-black text-red-400 uppercase tracking-widest">Deductions</span>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="text-left px-4 py-2 text-[9px] font-black text-textSecondary uppercase tracking-widest">Component</th>
                      <th className="text-right px-4 py-2 text-[9px] font-black text-textSecondary uppercase tracking-widest">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {displayDeductions.map((d, i) => (
                      <tr key={i} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5 text-sm">{d.name}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-red-400">− {fmt(d.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Net Pay */}
            <div className="p-6 rounded-2xl bg-gradient-to-r from-primary/10 to-accent/5 border border-primary/30 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-textSecondary uppercase tracking-widest">Net Pay</p>
                <p className="text-4xl font-black text-white mt-1">{fmt(record.netPay)}</p>
                <p className="text-[10px] text-textSecondary mt-1">For period: {record.payrollMonth}</p>
              </div>
              <div className="text-right space-y-1">
                <div className="text-[9px] font-black text-textSecondary uppercase tracking-widest">Gross</div>
                <div className="font-mono font-bold text-sm">{fmt(record.grossSalary)}</div>
                <div className="text-[9px] font-black text-textSecondary uppercase tracking-widest mt-2">Total Deductions</div>
                <div className="font-mono font-bold text-sm text-red-400">
                  − {fmt((record.withholdingTax || 0) + (record.otherDeductions || 0))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-4 border-t border-white/5 text-[10px] text-textSecondary">
              <p>Generated by GAnovaOS HR · {new Date().toLocaleDateString()}</p>
              <p>This is a system-generated document</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
