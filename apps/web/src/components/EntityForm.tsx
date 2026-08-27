import React, { useState } from 'react';
import { Save, X, Loader2, Upload, File, Trash2, Plus, GripVertical } from 'lucide-react';
import { token as authToken } from '../lib/auth';
import { errorMessage } from '../lib/errors';

export interface Field {
  key: string;
  label: string;
  type: 'text' | 'number' | 'email' | 'password' | 'select' | 'date' | 'file' | 'textarea';
  options?: { value: string; label: string }[];
  required?: boolean;
  initialValue?: any;
  action?: { label: string; onClick: () => void };
  /**
   * R2 key prefix for a `file` field. Required, and must be one of the
   * prefixes ALLOWED_UPLOAD_PREFIXES declares in src/routes/assets.ts.
   *
   * This used to be optional, falling back to the form's *title* slugified
   * ("Upload Institutional Asset" -> `upload_institutional_asset/`). That put
   * objects in the bucket under a prefix nobody had chosen and no server rule
   * knew about, which is how several modules' files ended up unreadable.
   */
  pathPrefix?: string;
}

function StagesEditor({ value, onChange }: { value: any, onChange: (val: string) => void }) {
  const [stages, setStages] = useState<{name: string, value?: number}[]>(() => {
    try {
      if (typeof value === 'string') return JSON.parse(value);
      if (Array.isArray(value)) return value;
      return [];
    } catch {
      return [];
    }
  });

  const updateStage = (index: number, key: 'name' | 'value', val: any) => {
    const newStages = [...stages];
    newStages[index] = { ...newStages[index], [key]: val };
    setStages(newStages);
    onChange(JSON.stringify(newStages));
  };

  const addStage = () => {
    const newStages = [...stages, { name: 'New Stage' }];
    setStages(newStages);
    onChange(JSON.stringify(newStages));
  };

  const removeStage = (index: number) => {
    const newStages = stages.filter((_, i) => i !== index);
    setStages(newStages);
    onChange(JSON.stringify(newStages));
  };

  return (
    <div className="space-y-3 p-4 bg-black/20 rounded-2xl border border-white/5">
      {stages.map((stage, i) => (
        <div key={i} className="flex items-center gap-3 bg-surface/50 p-2.5 rounded-xl border border-white/10 group transition-all hover:border-primary/50">
          <GripVertical className="w-4 h-4 text-white/20 cursor-move" />
          
          <div className="flex-1 flex gap-2">
            <input 
              type="text" 
              value={stage.name} 
              onChange={e => updateStage(i, 'name', e.target.value)} 
              className="w-1/2 bg-transparent border-none text-sm text-white font-bold focus:outline-none placeholder:text-white/20" 
              placeholder="Stage Name (e.g. Awareness)" 
            />
            <div className="w-[1px] bg-white/10" />
            <input 
              type="number" 
              value={stage.value || ''} 
              onChange={e => updateStage(i, 'value', e.target.value ? Number(e.target.value) : undefined)} 
              className="w-1/2 bg-transparent border-none text-sm text-emerald-400 font-bold focus:outline-none placeholder:text-emerald-400/20" 
              placeholder="KPI Value (optional)" 
            />
          </div>

          <button 
            type="button"
            onClick={() => removeStage(i)} 
            className="p-2 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-red-400 rounded-lg transition-all"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button 
        type="button" 
        onClick={addStage}
        className="w-full py-3 flex items-center justify-center gap-2 border border-dashed border-white/20 rounded-xl text-sm font-bold text-textSecondary hover:text-white hover:border-white/50 hover:bg-white/5 transition-all"
      >
        <Plus className="w-4 h-4" /> Add Stage
      </button>
    </div>
  );
}

interface EntityFormProps {
  title: string;
  fields: Field[];
  initialData?: any;
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
  loading?: boolean;
  onChange?: (data: any, changedKey: string) => any;
}

export default function EntityForm({ title, fields, initialData = {}, onClose, onSubmit, loading: externalLoading, onChange }: EntityFormProps) {
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

  const handleFieldChange = (key: string, val: any) => {
    const updated = { ...formData, [key]: val };
    if (onChange) {
      const modified = onChange(updated, key);
      setFormData(modified || updated);
    } else {
      setFormData(updated);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Clean empty strings to null to prevent foreign key constraint errors
    const cleanedData = { ...formData };
    
    // Remove system-only fields that should not be submitted
    const systemFields = ['createdAt', 'updatedAt', 'id'];
    systemFields.forEach(f => {
      // Only delete if it's a NEW record (no ID in initialData)
      if (f !== 'id' || !initialData?.id) {
        delete cleanedData[f];
      }
    });

    Object.keys(cleanedData).forEach(key => {
      if (cleanedData[key] === "") {
        cleanedData[key] = null;
      }
      
      // Attempt to cast string booleans back to boolean if needed by some fields
      if (cleanedData[key] === "true") cleanedData[key] = true;
      if (cleanedData[key] === "false") cleanedData[key] = false;
    });

    try {
      await onSubmit(cleanedData);
      setLoading(false);
    } catch (err) {
      console.error('EntityForm submit error:', err);
      setError(errorMessage(err, 'An error occurred while saving.'));
      setLoading(false);
    }
  };

  const handleFileUpload = async (key: string, file: File, pathPrefix?: string) => {
    setUploading(key);
    setError('');
    try {
      const token = authToken();
      if (!pathPrefix) {
        // Deriving one from the form title is what created unreadable orphan
        // prefixes before; fail loudly instead of inventing a new one.
        throw new Error('This upload field is misconfigured (no pathPrefix). Please report it.');
      }
      const r2Key = `${pathPrefix}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
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
    } catch {
      setError('File upload failed. Please try again.');
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md md:p-4" onClick={onClose}>
      <div className="glass-panel w-full h-full md:h-auto md:max-h-[85vh] md:max-w-lg md:rounded-3xl overflow-hidden shadow-2xl border-white/20 animate-in fade-in zoom-in duration-200 flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 md:p-6 border-b border-white/10 bg-white/5 shrink-0">
          <h2 className="text-lg md:text-xl font-bold text-white">{title}</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-5 h-5 text-textSecondary" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 p-5 md:p-6 overflow-y-auto space-y-5 custom-scrollbar min-h-0">
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
                
                <div className="relative group">
                  {field.type === 'select' ? (
                  <select
                    required={field.required}
                    value={formData[field.key] || ''}
                    onChange={e => handleFieldChange(field.key, e.target.value)}
                    className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors appearance-none"
                  >
                    <option value="">Select option...</option>
                    {field.options?.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                ) : field.type === 'textarea' ? (
                  field.key === 'stages' ? (
                    <StagesEditor 
                      value={formData[field.key] || field.initialValue || '[]'} 
                      onChange={(val) => setFormData({ ...formData, [field.key]: val })} 
                    />
                  ) : (
                    <textarea
                      required={field.required}
                      value={formData[field.key] || ''}
                      onChange={e => handleFieldChange(field.key, e.target.value)}
                      rows={3}
                      className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors"
                    />
                  )
                ) : field.type === 'file' ? (
                  <div className="space-y-3">
                    {formData[field.key] ? (
                      <div className="space-y-2">
                        {formData[field.key].match(/\.(jpg|jpeg|png|gif|webp)$|^data:image/i) && (
                          <div className="w-full aspect-video rounded-xl overflow-hidden border border-white/10 bg-black/20">
                            <img 
                              src={formData[field.key].startsWith('/api/') ? `${formData[field.key]}?token=${authToken()}` : formData[field.key]} 
                              alt="Preview" 
                              className="w-full h-full object-cover" 
                            />
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
                          onChange={e => e.target.files?.[0] && handleFileUpload(field.key, e.target.files[0], field.pathPrefix)}
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
                    onChange={e => handleFieldChange(field.key, e.target.value)}
                    className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors"
                  />
                )}

                {field.action && (
                  <button 
                    type="button" 
                    onClick={field.action.onClick}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest rounded-lg border border-primary/20 hover:bg-primary/20 transition-all"
                  >
                    {field.action.label}
                  </button>
                )}
                </div>
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
