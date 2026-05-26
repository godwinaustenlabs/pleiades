import { useState, useEffect, useCallback } from 'react';
import { Plus, GripVertical, Users, Building2, Trash2, X, Lock, Edit2, CalendarDays, AlertCircle, FileText, Upload, Loader2, Clock, Tags } from 'lucide-react';

const API = '/api';
const token = () => localStorage.getItem('ga_token') || '';

type Status = 'todo' | 'in_progress' | 'completed' | 'blocked';
const STATUSES: { key: Status; label: string; color: string; bg: string }[] = [
  { key: 'todo', label: 'To Do', color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/20' },
  { key: 'in_progress', label: 'In Progress', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
  { key: 'completed', label: 'Completed', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  { key: 'blocked', label: 'Blocked', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
];

const PRIORITIES: Record<string, { label: string; color: string; dot: string }> = {
  urgent: { label: 'Urgent', color: 'bg-red-500/10 text-red-400 border-red-500/20', dot: 'bg-red-500' },
  high: { label: 'High', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20', dot: 'bg-orange-500' },
  medium: { label: 'Medium', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20', dot: 'bg-amber-500' },
  low: { label: 'Low', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20', dot: 'bg-blue-500' },
};

interface TaskBoardProps {
  department?: string;
  committeeId?: string;
  employeeId?: string;
  accentColor?: string;
  canEdit?: boolean;
}

export default function TaskBoard({ department, committeeId, employeeId, canEdit = true }: TaskBoardProps) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [committees, setCommittees] = useState<any[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<Status | null>(null);

  const fetchTasks = useCallback(() => {
    const params = new URLSearchParams();
    if (department) params.set('dept', department);
    if (committeeId) params.set('committeeId', committeeId);
    if (employeeId) params.set('userId', employeeId); // Backend still uses 'userId' query param
    setLoading(true);
    fetch(`${API}/tasks?${params}`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json()).then(d => { setTasks(d.data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [department, committeeId, employeeId]);

  useEffect(() => {
    fetchTasks();
    fetch(`${API}/core/employees`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json()).then(d => setEmployees((d.data || []).filter((e: any) => e.employmentStatus === 'active'))).catch(() => { });
    fetch(`${API}/core/committees`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json()).then(d => setCommittees(d.data || [])).catch(() => { });
  }, [fetchTasks]);

  /* ── Drag & Drop ── */
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    if (!canEdit) return;
    setDraggedId(taskId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
    (e.target as HTMLElement).style.opacity = '0.5';
  };
  const handleDragEnd = (e: React.DragEvent) => {
    (e.target as HTMLElement).style.opacity = '1';
    setDraggedId(null);
    setDragOverCol(null);
  };
  const handleDragOver = (e: React.DragEvent, status: Status) => {
    if (!canEdit) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCol(status);
  };
  const handleDragLeave = () => setDragOverCol(null);

  const handleDrop = async (e: React.DragEvent, newStatus: Status) => {
    if (!canEdit) return;
    e.preventDefault();
    setDragOverCol(null);
    const taskId = e.dataTransfer.getData('text/plain');
    if (!taskId) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.status === newStatus) return;
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
    const colTasks = tasks.filter(t => t.status === newStatus);
    await fetch(`${API}/tasks/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify({ tasks: [{ id: taskId, status: newStatus, boardPosition: colTasks.length, department: department || 'General' }] }),
    });
  };

  /* ── CRUD ── */
  const handleDelete = async (id: string) => {
    if (!canEdit) return;
    if (!confirm('Delete this task permanently?')) return;
    setTasks(prev => prev.filter(t => t.id !== id));
    await fetch(`${API}/tasks/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
  };

  const handleCreate = async (data: any) => {
    try {
      const payload = { ...data, department: department || 'General', committeeId: committeeId || data.committeeId || null };
      const res = await fetch(`${API}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(payload),
      });
      if (res.status === 403) { alert('Permission denied: you cannot create tasks in this module.'); return; }
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed to create task'); }
      setShowCreate(false);
      fetchTasks();
    } catch (err: any) {
      alert(err.message || 'An error occurred');
    }
  };

  const handleEdit = async (taskId: string, data: any) => {
    try {
      const res = await fetch(`${API}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(data),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed to update task'); }
      setEditingTask(null);
      fetchTasks();
    } catch (err: any) {
      alert(err.message || 'An error occurred');
    }
  };

  const grouped = STATUSES.map(s => ({
    ...s,
    tasks: tasks.filter(t => t.status === s.key).sort((a, b) => (a.boardPosition || 0) - (b.boardPosition || 0)),
  }));

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-2 border-white/20 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold">Task Board</h3>
          <span className="text-[10px] font-black uppercase tracking-widest text-textSecondary bg-white/5 px-2 py-1 rounded-md border border-white/10">
            {department || 'General'}
          </span>
          {!canEdit && (
            <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-textSecondary bg-white/5 px-2 py-1 rounded-md border border-white/10">
              <Lock className="w-2.5 h-2.5" /> Read-only
            </span>
          )}
        </div>
        {canEdit && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary/90 text-white text-xs font-black uppercase tracking-widest rounded-full transition-all shadow-lg shadow-primary/20 hover:scale-[1.02]"
          >
            <Plus className="w-4 h-4" /> New Task
          </button>
        )}
      </div>

      <div className="flex md:grid md:grid-cols-2 lg:grid-cols-4 gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-4 -mx-4 px-4 md:mx-0 md:px-0">
        {grouped.map(col => (
          <div key={col.key}
            onDragOver={(e) => handleDragOver(e, col.key)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, col.key)}
            className={`rounded-2xl border p-4 min-h-[300px] transition-all duration-200 w-[85vw] shrink-0 snap-center md:w-auto md:flex-1 ${dragOverCol === col.key
              ? 'border-primary/50 bg-primary/5 shadow-lg shadow-primary/10 scale-[1.01]'
              : col.bg
              }`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full"
                  style={{ background: col.key === 'todo' ? '#94a3b8' : col.key === 'in_progress' ? '#f59e0b' : col.key === 'completed' ? '#10b981' : '#ef4444' }} />
                <span className={`text-[11px] font-black uppercase tracking-widest ${col.color}`}>{col.label}</span>
              </div>
              <span className="text-[10px] font-black text-white/30 bg-white/5 px-2 py-0.5 rounded-full">{col.tasks.length}</span>
            </div>

            <div className="space-y-2.5">
              {col.tasks.map(task => (
                <div key={task.id} draggable={canEdit}
                  onDragStart={(e) => handleDragStart(e, task.id)}
                  onDragEnd={handleDragEnd}
                  className={`group glass-panel rounded-xl p-3.5 ${canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'} transition-all duration-200 hover:border-white/20 hover:shadow-lg ${draggedId === task.id ? 'opacity-50 scale-95' : ''}`}>
                  <div className="flex items-start gap-2">
                    {canEdit && <GripVertical className="w-3.5 h-3.5 mt-0.5 text-white/20 group-hover:text-white/40 flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        {task.priority && (
                          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITIES[task.priority]?.dot || 'bg-white/30'}`} />
                        )}
                        <h4 className="text-sm font-bold truncate leading-none">{task.title}</h4>
                      </div>
                      {task.description && (
                        <p className="text-[11px] text-textSecondary line-clamp-2 mb-3 leading-relaxed">{task.description}</p>
                      )}
                      <div className="flex items-center gap-2 flex-wrap mt-2">
                        {task.priority && (
                          <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${PRIORITIES[task.priority]?.color}`}>
                            {PRIORITIES[task.priority]?.label}
                          </span>
                        )}
                        {task.assigneeId && (
                          <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-tighter text-textSecondary bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
                            <Users className="w-2.5 h-2.5" />
                            {employees.find(e => e.id === task.assigneeId)?.name || 'Assigned'}
                          </span>
                        )}
                        {task.committeeId && (
                          <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-tighter text-textSecondary bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
                            <Building2 className="w-2.5 h-2.5" />
                            {committees.find(cm => cm.id === task.committeeId)?.committeeName || 'Committee'}
                          </span>
                        )}
                        {(task.startDate || task.dueDate) && (
                          <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-tighter text-textSecondary bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
                            <CalendarDays className="w-2.5 h-2.5" />
                            {task.startDate ? new Date(task.startDate).toLocaleDateString() : '—'} 
                            <span className="mx-1">→</span> 
                            {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '—'}
                          </span>
                        )}
                        {task.taskType && (
                          <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-tighter text-textSecondary bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
                            <Tags className="w-2.5 h-2.5" />
                            {task.taskType}
                          </span>
                        )}
                        {task.estimatedHours > 0 && (
                          <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-tighter text-textSecondary bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
                            <Clock className="w-2.5 h-2.5" />
                            {task.estimatedHours}h
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      {canEdit && (
                        <button onClick={() => setEditingTask(task)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-blue-500/10 hover:text-blue-400 rounded-lg transition-all text-white/20">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {canEdit && (
                        <button onClick={() => handleDelete(task.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/10 hover:text-red-400 rounded-lg transition-all text-white/20">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {col.tasks.length === 0 && (
                <div className="text-center py-10 text-[10px] font-black uppercase tracking-[0.2em] text-white/10 border border-dashed border-white/10 rounded-xl">
                  {canEdit ? 'Drop tasks here' : 'Empty Column'}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Create Task Modal */}
      {showCreate && (
        <TaskFormModal
          mode="create"
          department={department}
          defaultCommitteeId={committeeId}
          employees={employees}
          committees={committees}
          onClose={() => setShowCreate(false)}
          onSubmit={handleCreate}
        />
      )}

      {/* Edit Task Modal */}
      {editingTask && (
        <TaskFormModal
          mode="edit"
          department={department}
          defaultCommitteeId={committeeId}
          employees={employees}
          committees={committees}
          initialData={editingTask}
          onClose={() => setEditingTask(null)}
          onSubmit={(data) => handleEdit(editingTask.id, data)}
        />
      )}
    </div>
  );
}

/* ── Unified Task Form Modal ── */
interface TaskFormModalProps {
  mode: 'create' | 'edit';
  department?: string;
  defaultCommitteeId?: string;
  employees: any[];
  committees: any[];
  initialData?: any;
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
}

function TaskFormModal({ mode, department, defaultCommitteeId, employees, committees, initialData, onClose, onSubmit }: TaskFormModalProps) {
  const [form, setForm] = useState({
    title: initialData?.title || '',
    description: initialData?.description || '',
    priority: initialData?.priority || 'medium',
    status: initialData?.status || 'todo',
    assigneeId: initialData?.assigneeId || '',
    committeeId: initialData?.committeeId || defaultCommitteeId || '',
    startDate: initialData?.startDate ? initialData.startDate.substring(0, 10) : '',
    dueDate: initialData?.dueDate ? initialData.dueDate.substring(0, 10) : '',
    taskType: initialData?.taskType || 'operational',
    estimatedHours: initialData?.estimatedHours || 0,
  });
  const [attachments, setAttachments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (mode === 'edit' && initialData?.id) {
      fetch(`${API}/tasks/${initialData.id}/attachments`, { headers: { Authorization: `Bearer ${token()}` } })
        .then(r => r.json()).then(d => setAttachments(d.data || []));
    }
  }, [mode, initialData]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !initialData?.id) return;

    setUploading(true);
    try {
      const r2Key = `tasks/${initialData.id}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
      const res = await fetch(`/api/assets/upload/${r2Key}`, {
        method: 'PUT',
        headers: { 'Content-Type': file.type, Authorization: `Bearer ${token()}` },
        body: file
      });
      if (!res.ok) throw new Error('Upload failed');

      await res.json();
      await fetch(`${API}/tasks/${initialData.id}/attachments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({
          title: file.name,
          r2Key,
          fileSize: file.size,
          mimeType: file.type
        })
      });

      // Refresh attachments
      const attRes = await fetch(`${API}/tasks/${initialData.id}/attachments`, { headers: { Authorization: `Bearer ${token()}` } });
      const attD = await attRes.json();
      setAttachments(attD.data || []);
    } catch (err) {
      alert('File upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { setError('Task title is required.'); return; }
    setError('');
    setLoading(true);
    const data: any = { ...form };
    if (!data.assigneeId) data.assigneeId = null;
    if (!data.committeeId) data.committeeId = null;
    if (!data.startDate) data.startDate = null;
    if (!data.dueDate) data.dueDate = null;
    try {
      await onSubmit(data);
    } finally {
      setLoading(false);
    }
  };

  const inputCls = 'w-full bg-black/20 border border-white/10 rounded-2xl px-5 py-3.5 text-sm focus:outline-none focus:border-primary font-medium transition-all';
  const labelCls = 'block text-[10px] font-black uppercase tracking-[0.2em] text-textSecondary mb-2';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md md:p-4 animate-in fade-in" onClick={onClose}>
      <div className="bg-surface md:border border-white/10 md:rounded-[2.5rem] w-full h-full md:h-auto md:max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 md:p-8 border-b border-white/5 bg-white/5 flex-shrink-0">
          <div>
            <h2 className="text-xl font-black tracking-tight">{mode === 'create' ? 'Create Task' : 'Edit Task'}</h2>
            <p className="text-[10px] font-black uppercase tracking-widest text-textSecondary mt-1">
              {department || 'General Operations'} · {mode === 'edit' ? 'Update existing task' : 'New task will be assigned to this department'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X className="w-5 h-5" /></button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 p-6 md:p-8 space-y-5 overflow-y-auto custom-scrollbar">
          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-xs font-bold">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}

          {/* Title */}
          <div>
            <label className={labelCls}>Title <span className="text-red-400">*</span></label>
            <input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="Describe the task clearly..." className={inputCls} />
          </div>

          {/* Description */}
          <div>
            <label className={labelCls}>Description</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              rows={3} placeholder="Additional context or requirements..."
              className={`${inputCls} resize-none leading-relaxed`} />
          </div>

          {/* Priority / Status / Task Type / Estimated Hours */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className={labelCls}>Priority <span className="text-red-400">*</span></label>
              <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} className={inputCls}>
                <option value="low">🔵 Low</option>
                <option value="medium">🟡 Medium</option>
                <option value="high">🟠 High</option>
                <option value="urgent">🔴 Urgent</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Status <span className="text-red-400">*</span></label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className={inputCls}>
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="blocked">Blocked</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Task Type</label>
              <select value={form.taskType} onChange={e => setForm({ ...form, taskType: e.target.value })} className={inputCls}>
                <option value="operational">Operational</option>
                <option value="administrative">Administrative</option>
                <option value="technical">Technical</option>
                <option value="review">Review</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Est. Hours</label>
              <input type="number" step="0.5" value={form.estimatedHours} onChange={e => setForm({ ...form, estimatedHours: Number(e.target.value) })} className={inputCls} />
            </div>
          </div>

          {/* Assignee / Date row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Assign To</label>
              <select value={form.assigneeId} onChange={e => setForm({ ...form, assigneeId: e.target.value })} className={inputCls}>
                <option value="">— Unassigned —</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Start Date</label>
              <input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Due Date</label>
              <input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} className={inputCls} />
            </div>
          </div>

          {/* Committee */}
          {committees.length > 0 && (
            <div>
              <label className={labelCls}>Link to Committee</label>
              <select value={form.committeeId} onChange={e => setForm({ ...form, committeeId: e.target.value })} className={inputCls}>
                <option value="">— None —</option>
                {committees.map(c => <option key={c.id} value={c.id}>{c.committeeName}</option>)}
              </select>
            </div>
          )}

          {/* Attachments (only in edit mode for now to keep ID simple) */}
          {mode === 'edit' && (
            <div className="pt-4 border-t border-white/5">
              <label className={labelCls}>Attachments</label>
              <div className="space-y-3">
                {attachments.map(att => (
                  <div key={att.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                    <div className="flex items-center gap-3">
                      <FileText className="w-4 h-4 text-textSecondary" />
                      <span className="text-xs font-bold truncate max-w-[200px]">{att.title}</span>
                    </div>
                    <a href={`/api/assets/download/${att.r2Key}?token=${token()}`} target="_blank" rel="noreferrer" className="text-[10px] font-black uppercase text-primary hover:underline">View</a>
                  </div>
                ))}

                <div className="relative">
                  <input type="file" onChange={handleFileUpload} className="hidden" id="task-att-upload" disabled={uploading} />
                  <label htmlFor="task-att-upload" className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-dashed border-white/20 hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer text-[10px] font-black uppercase tracking-widest text-textSecondary hover:text-primary">
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {uploading ? 'Uploading...' : 'Attach Document'}
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-4 pt-2">
            <button type="button" onClick={onClose}
              className="px-8 py-3 text-xs font-black uppercase tracking-widest text-textSecondary hover:text-white transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="px-10 py-3.5 text-xs font-black uppercase tracking-widest bg-primary hover:bg-primary/90 text-white rounded-full transition-all disabled:opacity-50 shadow-lg shadow-primary/20 flex items-center gap-2">
              {loading ? 'Saving...' : mode === 'create' ? 'Deploy Task' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
