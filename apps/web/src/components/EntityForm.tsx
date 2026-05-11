import React, { useState } from 'react';
import { Save, X, Loader2, Upload, File, Trash2 } from 'lucide-react';

export interface Field {
  key: string;
  label: string;
  type: 'text' | 'number' | 'email' | 'password' | 'select' | 'date' | 'file' | 'textarea';
  options?: { value: string; label: string }[];
  required?: boolean;
  initialValue?: any;
}

interface EntityFormProps {
  title: string;
  fields: Field[];
  initialData?: any;
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
  loading?: boolean;
}

export default function EntityForm({ title, fields, initialData = {}, onClose, onSubmit, loading: externalLoading }: EntityFormProps) {
  const [formData, setFormData] = useState(() => {
    const data = { ...initialData };
    fields.forEach(f => {
      if (data[f.key] === undefined && f.initialValue !== undefined) {
        data[f.key] = f.initialValue;
      }
    });
    return data;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await onSubmit(formData);
    } catch (err: any) {
      setError(err.message || 'An error occurred while saving.');
      setLoading(false);
    }
  };

  const handleFileUpload = async (key: string, file: File) => {
    setUploading(key);
    setError('');
    try {
      const token = localStorage.getItem('ganova_token') || '';
      const r2Key = `${title.toLowerCase().replace(/\s+/g, '_')}/${Date.now()}_${file.name}`;
      const res = await fetch(`/api/assets/upload/${r2Key}`, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
          Authorization: `Bearer ${token}`
        },
        body: file
      });
      
      if (!res.ok) throw new Error('Upload failed');
      const d = await res.json();
      
      setFormData({ ...formData, [key]: d.data.url });
    } catch (err: any) {
      setError('File upload failed. Please try again.');
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md p-4" onClick={onClose}>
      <div className="glass-panel rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-white/20 animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/5">
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-5 h-5 text-textSecondary" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[70vh] space-y-5 custom-scrollbar">
          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-5">
            {fields.map(field => (
              <div key={field.key} className="space-y-1.5">
                <label className="block text-xs font-bold text-textSecondary uppercase tracking-wider ml-1">
                  {field.label} {field.required && <span className="text-primary">*</span>}
                </label>
                
                {field.type === 'select' ? (
                  <select
                    required={field.required}
                    value={formData[field.key] || ''}
                    onChange={e => setFormData({ ...formData, [field.key]: e.target.value })}
                    className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors appearance-none"
                  >
                    <option value="">Select option...</option>
                    {field.options?.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                ) : field.type === 'textarea' ? (
                  <textarea
                    required={field.required}
                    value={formData[field.key] || ''}
                    onChange={e => setFormData({ ...formData, [field.key]: e.target.value })}
                    rows={3}
                    className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors"
                  />
                ) : field.type === 'file' ? (
                  <div className="space-y-3">
                    {formData[field.key] ? (
                      <div className="space-y-2">
                        {formData[field.key].match(/\.(jpg|jpeg|png|gif|webp)$|^data:image/i) && (
                          <div className="w-full aspect-video rounded-xl overflow-hidden border border-white/10 bg-black/20">
                            <img src={formData[field.key]} alt="Preview" className="w-full h-full object-cover" />
                          </div>
                        )}
                        <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                          <div className="flex items-center gap-3 truncate">
                            <File className="w-4 h-4 text-primary shrink-0" />
                            <span className="text-sm truncate">{formData[field.key].split('/').pop()}</span>
                          </div>
                          <button 
                            type="button" 
                            onClick={() => setFormData({ ...formData, [field.key]: null })}
                            className="p-1.5 hover:bg-red-400/20 text-red-400 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="relative group">
                        <input
                          type="file"
                          onChange={e => e.target.files?.[0] && handleFileUpload(field.key, e.target.files[0])}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />
                        <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-white/10 rounded-2xl group-hover:border-primary/50 group-hover:bg-primary/5 transition-all">
                          {uploading === field.key ? (
                            <Loader2 className="w-6 h-6 text-primary animate-spin" />
                          ) : (
                            <>
                              <Upload className="w-6 h-6 text-textSecondary mb-2 group-hover:text-primary transition-colors" />
                              <p className="text-sm text-textSecondary group-hover:text-textPrimary">Click or drag file to upload</p>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <input
                    type={field.type}
                    required={field.required}
                    value={formData[field.key] || ''}
                    onChange={e => setFormData({ ...formData, [field.key]: e.target.value })}
                    className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors"
                  />
                )}
              </div>
            ))}
          </div>
        </form>

        <div className="p-6 bg-white/5 border-t border-white/10 flex gap-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-white/10 text-sm font-bold text-textSecondary hover:bg-white/5 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || externalLoading || !!uploading}
            className="flex-1 py-3 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
          >
            {loading || externalLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" /> Save Record</>}
          </button>
        </div>
      </div>
    </div>
  );
}
