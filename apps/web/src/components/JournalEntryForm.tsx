import React, { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';

interface JournalEntryFormProps {
  initialData?: any;
  accounts: any[];
  invoices: any[];
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
}

export default function JournalEntryForm({ initialData, accounts, invoices, onClose, onSubmit }: JournalEntryFormProps) {
  const [entryDate, setEntryDate] = useState(initialData?.entryDate || new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState(initialData?.description || '');
  const [invoiceId, setInvoiceId] = useState(initialData?.invoiceId || '');
  const [lines, setLines] = useState<any[]>(
    initialData?.lines ? (typeof initialData.lines === 'string' ? JSON.parse(initialData.lines) : initialData.lines).map((l: any, i: number) => ({ ...l, id: l.id || Math.random().toString() + i }))
      : (initialData?.debitAccountId ? [
        { id: '1', type: 'debit', accountId: initialData.debitAccountId, amount: initialData.amount || 0 },
        { id: '2', type: 'credit', accountId: initialData.creditAccountId, amount: initialData.amount || 0 }
      ] : [
        { id: '1', type: 'debit', accountId: '', amount: 0 },
        { id: '2', type: 'credit', accountId: '', amount: 0 }
      ])
  );
  const [loading, setLoading] = useState(false);

  const addLine = (type: 'debit' | 'credit') => {
    setLines([...lines, { id: Math.random().toString(), type, accountId: '', amount: 0 }]);
  };

  const updateLine = (id: string, field: string, value: any) => {
    setLines(lines.map(l => l.id === id ? { ...l, [field]: value } : l));
  };

  const removeLine = (id: string) => {
    setLines(lines.filter(l => l.id !== id));
  };

  const drTotal = lines.filter(l => l.type === 'debit').reduce((acc, l) => acc + (Number(l.amount) || 0), 0);
  const crTotal = lines.filter(l => l.type === 'credit').reduce((acc, l) => acc + (Number(l.amount) || 0), 0);
  const isBalanced = Math.abs(drTotal - crTotal) < 0.01 && drTotal > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isBalanced) return;
    
    // basic validation
    if (lines.some(l => !l.accountId || l.amount <= 0)) {
      alert("All lines must have an account and an amount > 0");
      return;
    }

    setLoading(true);
    try {
      const data = {
        entryDate,
        description,
        invoiceId: invoiceId || null,
        lines: lines.map(({ type, accountId, amount }) => ({ type, accountId, amount: Number(amount) }))
      };
      await onSubmit(data);
    } catch (err) {
      console.error(err);
      alert('Failed to save journal entry.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose} />
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col bg-surface/95 backdrop-blur-xl rounded-[2rem] shadow-2xl border border-white/10 overflow-hidden animate-in zoom-in-95 duration-300">
        
        <div className="p-6 md:p-8 border-b border-white/10 flex items-center justify-between bg-black/20">
          <h2 className="text-xl md:text-2xl font-black">{initialData ? 'Update Journal Entry' : 'New Journal Entry'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-6 h-6 text-textSecondary" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
          <form id="journal-form" onSubmit={handleSubmit} className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-xs font-bold text-textSecondary mb-2 block uppercase tracking-widest">Entry Date</label>
                <input type="date" required value={entryDate} onChange={e => setEntryDate(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all" />
              </div>
              <div>
                <label className="text-xs font-bold text-textSecondary mb-2 block uppercase tracking-widest">Attach Invoice</label>
                <select value={invoiceId} onChange={e => setInvoiceId(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all">
                  <option value="">— None —</option>
                  {invoices.map(i => <option key={i.id} value={i.id}>{i.invoiceNumber} – {i.vendorName || 'N/A'}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-textSecondary mb-2 block uppercase tracking-widest">Description</label>
              <textarea required rows={2} value={description} onChange={e => setDescription(e.target.value)} className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* DEBITS */}
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-black text-emerald-400 tracking-widest uppercase">Debits</h3>
                  <button type="button" onClick={() => addLine('debit')} className="text-xs flex items-center gap-1 text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 px-2 py-1 rounded">
                    <Plus className="w-3 h-3" /> Add
                  </button>
                </div>
                <div className="space-y-3">
                  {lines.filter(l => l.type === 'debit').map(line => (
                    <div key={line.id} className="flex gap-2 items-center">
                      <select required value={line.accountId} onChange={e => updateLine(line.id, 'accountId', e.target.value)} className="flex-1 min-w-0 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50">
                        <option value="">Select Account</option>
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.accountName}</option>)}
                      </select>
                      <input type="number" required min="0" step="0.01" value={line.amount || ''} onChange={e => updateLine(line.id, 'amount', e.target.value)} className="w-24 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white text-right focus:outline-none focus:border-emerald-500/50" placeholder="0.00" />
                      <button type="button" onClick={() => removeLine(line.id)} className="p-2 text-textSecondary hover:text-red-400 rounded-lg hover:bg-white/5 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* CREDITS */}
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-black text-rose-400 tracking-widest uppercase">Credits</h3>
                  <button type="button" onClick={() => addLine('credit')} className="text-xs flex items-center gap-1 text-rose-400 hover:text-rose-300 bg-rose-500/10 px-2 py-1 rounded">
                    <Plus className="w-3 h-3" /> Add
                  </button>
                </div>
                <div className="space-y-3">
                  {lines.filter(l => l.type === 'credit').map(line => (
                    <div key={line.id} className="flex gap-2 items-center">
                      <select required value={line.accountId} onChange={e => updateLine(line.id, 'accountId', e.target.value)} className="flex-1 min-w-0 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-rose-500/50">
                        <option value="">Select Account</option>
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.accountName}</option>)}
                      </select>
                      <input type="number" required min="0" step="0.01" value={line.amount || ''} onChange={e => updateLine(line.id, 'amount', e.target.value)} className="w-24 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white text-right focus:outline-none focus:border-rose-500/50" placeholder="0.00" />
                      <button type="button" onClick={() => removeLine(line.id)} className="p-2 text-textSecondary hover:text-red-400 rounded-lg hover:bg-white/5 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className={`p-4 rounded-xl flex items-center justify-between border ${isBalanced ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
              <div className="font-bold">
                {isBalanced ? '✅ Entry is Balanced' : '❌ Out of Balance'}
              </div>
              <div className="flex gap-6 text-sm font-mono">
                <div>Dr: ${(drTotal).toLocaleString()}</div>
                <div>Cr: ${(crTotal).toLocaleString()}</div>
              </div>
            </div>
          </form>
        </div>

        <div className="p-6 md:p-8 border-t border-white/10 bg-black/20 flex justify-end gap-4">
          <button type="button" onClick={onClose} className="px-6 py-2.5 rounded-xl font-bold text-sm bg-white/5 hover:bg-white/10 transition-colors">
            Cancel
          </button>
          <button form="journal-form" type="submit" disabled={loading || !isBalanced} className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${loading || !isBalanced ? 'bg-emerald-500/50 cursor-not-allowed opacity-50' : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-[0_0_20px_rgba(16,185,129,0.3)]'}`}>
            {loading ? 'Saving...' : 'Save Entry'}
          </button>
        </div>
      </div>
    </div>
  );
}
