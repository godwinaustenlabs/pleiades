import React, { useState, useEffect } from 'react';
import { Plus, Trash2, X, ChevronRight, ChevronLeft, TrendingUp, TrendingDown, Save, AlertCircle, Loader2 } from 'lucide-react';
import { API, token } from '../lib/auth';
import { errorMessage } from '../lib/errors';


interface Component {
  id?: string;
  componentName: string;
  componentType: 'Earning' | 'Deduction';
  amountType: 'Fixed' | 'Percentage';
  value: number;
}

interface SalarySchemaWizardProps {
  employee: { id: string; name: string; baseSalary?: number };
  onClose: () => void;
  onSaved: () => void;
}

const PRESET_EARNINGS = ['House Rent Allowance', 'Medical Allowance', 'Transport Allowance', 'Performance Bonus', 'Fuel Allowance', 'Utility Allowance'];
const PRESET_DEDUCTIONS = ['Withholding Tax', 'EOBI', 'Social Security', 'Provident Fund', 'Absence Penalty', 'Custom Deduction'];

export default function SalarySchemaWizard({ employee, onClose, onSaved }: SalarySchemaWizardProps) {
  const [step, setStep] = useState(1);
  const [baseSalary, setBaseSalary] = useState(employee.baseSalary || 0);
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [components, setComponents] = useState<Component[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<any>(null);

  // Load existing schema
  useEffect(() => {
    fetch(`${API}/hr/salary-structures/${employee.id}/active`, {
      headers: { Authorization: `Bearer ${token()}` }
    })
      .then(r => r.json())
      .then(d => {
        if (d.data) {
          setBaseSalary(d.data.baseSalary);
          setEffectiveDate(d.data.effectiveDate);
          setComponents(d.data.components || []);
        }
      })
      .finally(() => setLoading(false));
  }, [employee.id]);

  // Live preview calculation
  useEffect(() => {
    const earnings = components.filter(c => c.componentType === 'Earning');
    const deductions = components.filter(c => c.componentType === 'Deduction');

    const calcAmount = (comp: Component) =>
      comp.amountType === 'Percentage' ? parseFloat(((comp.value / 100) * baseSalary).toFixed(2)) : comp.value;

    const grossSalary = parseFloat((baseSalary + earnings.reduce((s, c) => s + calcAmount(c), 0)).toFixed(2));
    const totalDeductions = parseFloat(deductions.reduce((s, c) => s + calcAmount(c), 0).toFixed(2));
    const netPay = parseFloat((grossSalary - totalDeductions).toFixed(2));

    setPreview({
      baseSalary,
      earnings: earnings.map(c => ({ name: c.componentName, amount: calcAmount(c) })),
      deductions: deductions.map(c => ({ name: c.componentName, amount: calcAmount(c) })),
      grossSalary,
      totalDeductions,
      netPay,
    });
  }, [baseSalary, components]);

  const addComponent = (type: 'Earning' | 'Deduction') => {
    setComponents(prev => [...prev, {
      componentName: '',
      componentType: type,
      amountType: 'Fixed',
      value: 0,
    }]);
  };

  const updateComponent = (idx: number, key: keyof Component, val: any) => {
    setComponents(prev => prev.map((c, i) => i === idx ? { ...c, [key]: val } : c));
  };

  const removeComponent = (idx: number) => {
    setComponents(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    setError('');
    setSaving(true);
    try {
      const res = await fetch(`${API}/hr/salary-structures/${employee.id}/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ baseSalary, effectiveDate, components }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to save');
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const fmt = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

  if (loading) return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center scrim ">
      <Loader2 className="w-8 h-8 text-primary animate-spin" />
    </div>
  );

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center scrim p-4" onClick={onClose}>
      <div className="modal-panel rounded-3xl w-full max-w-4xl max-h-[92vh] overflow-hidden shadow-2xl border border-white/20 animate-in fade-in zoom-in duration-200 flex flex-col" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/5 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">Salary Schema — {employee.name}</h2>
            <p className="text-[10px] text-textSecondary uppercase tracking-widest mt-0.5">
              Step {step} of 3 · {step === 1 ? 'Base Salary' : step === 2 ? 'Components' : 'Preview & Save'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {/* Step indicators */}
            <div className="hidden sm:flex items-center gap-2">
              {[1, 2, 3].map(s => (
                <div key={s} className={`flex items-center gap-1.5 ${s < step ? 'cursor-pointer' : ''}`} onClick={() => s < step && setStep(s)}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black border transition-all ${
 s === step ? 'bg-primary border-primary text-surface' :
 s < step ? 'bg-success/20 border-success/50 text-success' :
 'bg-white/5 border-white/20 text-textSecondary'
 }`}>{s}</div>
                </div>
              ))}
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-textSecondary">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-8 space-y-6">

          {/* STEP 1: Base Salary */}
          {step === 1 && (
            <div className="max-w-lg mx-auto space-y-8 animate-in fade-in duration-300">
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto border border-primary/20">
                  <span className="text-2xl">💰</span>
                </div>
                <h3 className="text-xl font-bold">Set Base Salary</h3>
                <p className="text-sm text-textSecondary">This is the fixed monthly gross before any additions or deductions.</p>
              </div>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Monthly Base Salary (USD)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-textSecondary font-bold">$</span>
                    <input
                      type="number"
                      value={baseSalary}
                      onChange={e => setBaseSalary(Number(e.target.value))}
                      className="w-full bg-surface/50 border border-white/10 rounded-xl pl-8 pr-4 py-3 text-lg font-mono font-bold focus:outline-none focus:border-primary/50"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Effective Date</label>
                  <input
                    type="date"
                    value={effectiveDate}
                    onChange={e => setEffectiveDate(e.target.value)}
                    className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50"
                  />
                </div>
              </div>
              <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 text-sm text-textSecondary">
                💡 <strong className="text-white">Tip:</strong> Allowances and deductions will be added in the next step. This is the starting amount before components.
              </div>
            </div>
          )}

          {/* STEP 2: Components */}
          {step === 2 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              
              {/* Earnings */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-success uppercase tracking-widest flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" /> Earnings / Allowances
                  </h3>
                  <button onClick={() => addComponent('Earning')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-success/10 text-success border border-success/20 text-xs font-bold hover:bg-success/20 transition-all">
                    <Plus className="w-3 h-3" /> Add Earning
                  </button>
                </div>

                {components.filter(c => c.componentType === 'Earning').length === 0 && (
                  <div className="p-4 rounded-xl border border-dashed border-white/10 text-center text-xs text-textSecondary italic">No earnings added yet.</div>
                )}

                {components.map((comp, idx) => comp.componentType !== 'Earning' ? null : (
                  <div key={idx} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center p-3 rounded-xl bg-white/5 border border-white/10">
                    {/* Name */}
                    <div>
                      <input
                        list={`earning-presets-${idx}`}
                        type="text"
                        placeholder="e.g. House Rent Allowance"
                        value={comp.componentName}
                        onChange={e => updateComponent(idx, 'componentName', e.target.value)}
                        className="w-full bg-transparent border-b border-white/10 focus:border-primary/50 focus:outline-none text-sm py-1 font-medium"
                      />
                      <datalist id={`earning-presets-${idx}`}>
                        {PRESET_EARNINGS.map(p => <option key={p} value={p} />)}
                      </datalist>
                    </div>
                    {/* Type toggle */}
                    <select
                      value={comp.amountType}
                      onChange={e => updateComponent(idx, 'amountType', e.target.value)}
                      className="bg-surface/50 border border-white/10 rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                    >
                      <option value="Fixed">Fixed</option>
                      <option value="Percentage">% of Base</option>
                    </select>
                    {/* Value */}
                    <div className="relative w-28">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-textSecondary text-xs font-bold">
                        {comp.amountType === 'Percentage' ? '%' : '$'}
                      </span>
                      <input
                        type="number"
                        value={comp.value}
                        onChange={e => updateComponent(idx, 'value', Number(e.target.value))}
                        className="w-full bg-surface/50 border border-white/10 rounded-lg pl-5 pr-2 py-1.5 text-sm font-mono focus:outline-none focus:border-success/50"
                      />
                    </div>
                    {/* Delete */}
                    <button onClick={() => removeComponent(idx)} className="p-1.5 text-textSecondary hover:text-danger hover:bg-danger/10 rounded-lg transition-all">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Deductions */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-danger uppercase tracking-widest flex items-center gap-2">
                    <TrendingDown className="w-4 h-4" /> Deductions
                  </h3>
                  <button onClick={() => addComponent('Deduction')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-danger/10 text-danger border border-danger/20 text-xs font-bold hover:bg-danger/20 transition-all">
                    <Plus className="w-3 h-3" /> Add Deduction
                  </button>
                </div>

                {components.filter(c => c.componentType === 'Deduction').length === 0 && (
                  <div className="p-4 rounded-xl border border-dashed border-white/10 text-center text-xs text-textSecondary italic">No deductions added yet.</div>
                )}

                {components.map((comp, idx) => comp.componentType !== 'Deduction' ? null : (
                  <div key={idx} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center p-3 rounded-xl bg-white/5 border border-white/10">
                    <div>
                      <input
                        list={`deduction-presets-${idx}`}
                        type="text"
                        placeholder="e.g. Withholding Tax"
                        value={comp.componentName}
                        onChange={e => updateComponent(idx, 'componentName', e.target.value)}
                        className="w-full bg-transparent border-b border-white/10 focus:border-primary/50 focus:outline-none text-sm py-1 font-medium"
                      />
                      <datalist id={`deduction-presets-${idx}`}>
                        {PRESET_DEDUCTIONS.map(p => <option key={p} value={p} />)}
                      </datalist>
                    </div>
                    <select
                      value={comp.amountType}
                      onChange={e => updateComponent(idx, 'amountType', e.target.value)}
                      className="bg-surface/50 border border-white/10 rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                    >
                      <option value="Fixed">Fixed</option>
                      <option value="Percentage">% of Base</option>
                    </select>
                    <div className="relative w-28">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-textSecondary text-xs font-bold">
                        {comp.amountType === 'Percentage' ? '%' : '$'}
                      </span>
                      <input
                        type="number"
                        value={comp.value}
                        onChange={e => updateComponent(idx, 'value', Number(e.target.value))}
                        className="w-full bg-surface/50 border border-white/10 rounded-lg pl-5 pr-2 py-1.5 text-sm font-mono focus:outline-none focus:border-danger/50"
                      />
                    </div>
                    <button onClick={() => removeComponent(idx)} className="p-1.5 text-textSecondary hover:text-danger hover:bg-danger/10 rounded-lg transition-all">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Live summary pill at bottom */}
              {preview && (
                <div className="flex items-center justify-center gap-6 p-4 rounded-2xl bg-white/5 border border-white/10 text-sm">
                  <div className="text-center">
                    <p className="text-[10px] text-textSecondary uppercase tracking-widest">Gross</p>
                    <p className="font-black text-white">{fmt(preview.grossSalary)}</p>
                  </div>
                  <span className="text-textSecondary">—</span>
                  <div className="text-center">
                    <p className="text-[10px] text-textSecondary uppercase tracking-widest">Deductions</p>
                    <p className="font-black text-danger">{fmt(preview.totalDeductions)}</p>
                  </div>
                  <span className="text-textSecondary">=</span>
                  <div className="text-center">
                    <p className="text-[10px] text-textSecondary uppercase tracking-widest">Net Pay</p>
                    <p className="font-black text-success text-lg">{fmt(preview.netPay)}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Preview & Save */}
          {step === 3 && preview && (
            <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-300">
              <div className="text-center space-y-1 mb-6">
                <h3 className="text-xl font-bold">Review Salary Schema</h3>
                <p className="text-sm text-textSecondary">Confirm the salary breakdown for <strong className="text-white">{employee.name}</strong> before saving.</p>
              </div>

              {/* Base */}
              <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex justify-between items-center">
                <span className="text-sm font-bold text-textSecondary uppercase tracking-widest">Base Salary</span>
                <span className="font-black font-mono text-white">{fmt(preview.baseSalary)}</span>
              </div>

              {/* Earnings */}
              {preview.earnings.length > 0 && (
                <div className="rounded-xl overflow-hidden border border-success/20">
                  <div className="bg-success/10 px-4 py-2 flex items-center gap-2">
                    <TrendingUp className="w-3.5 h-3.5 text-success" />
                    <span className="text-[10px] font-black text-success uppercase tracking-widest">Earnings & Allowances</span>
                  </div>
                  {preview.earnings.map((e: any, i: number) => (
                    <div key={i} className="flex justify-between items-center px-4 py-2.5 border-t border-white/5 bg-white/[0.02] hover:bg-white/5 transition-colors">
                      <span className="text-sm">{e.name}</span>
                      <span className="font-mono font-bold text-success">+ {fmt(e.amount)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Deductions */}
              {preview.deductions.length > 0 && (
                <div className="rounded-xl overflow-hidden border border-danger/20">
                  <div className="bg-danger/10 px-4 py-2 flex items-center gap-2">
                    <TrendingDown className="w-3.5 h-3.5 text-danger" />
                    <span className="text-[10px] font-black text-danger uppercase tracking-widest">Deductions</span>
                  </div>
                  {preview.deductions.map((d: any, i: number) => (
                    <div key={i} className="flex justify-between items-center px-4 py-2.5 border-t border-white/5 bg-white/[0.02] hover:bg-white/5 transition-colors">
                      <span className="text-sm">{d.name}</span>
                      <span className="font-mono font-bold text-danger">− {fmt(d.amount)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Net Pay footer */}
              <div className="p-6 rounded-2xl bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/30 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black text-textSecondary uppercase tracking-widest">Monthly Net Pay</p>
                  <p className="text-3xl font-black text-white mt-1">{fmt(preview.netPay)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-textSecondary uppercase tracking-widest">Gross</p>
                  <p className="font-mono text-lg font-bold">{fmt(preview.grossSalary)}</p>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-3 p-4 bg-danger/10 border border-danger/20 rounded-xl text-danger text-xs font-bold">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer navigation */}
        <div className="p-6 border-t border-white/10 bg-surfaceAlt flex items-center justify-between shrink-0">
          <button
            onClick={() => step > 1 ? setStep(s => s - 1) : onClose()}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white/5 border border-white/10 font-bold text-sm hover:bg-white/10 transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
            {step === 1 ? 'Cancel' : 'Back'}
          </button>

          {step < 3 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={step === 1 && baseSalary <= 0}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-surface font-bold text-sm hover:opacity-90 transition-all disabled:opacity-40"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-8 py-3 rounded-xl bg-primary text-surface font-bold text-sm hover:opacity-90 transition-all disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving...' : 'Save Schema'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
