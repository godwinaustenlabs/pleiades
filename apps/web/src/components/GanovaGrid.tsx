import React, { useState } from 'react';
import { Search, Filter, ArrowUpDown, Plus, Edit2, Trash2, Download, FileText, ChevronLeft, ChevronRight } from 'lucide-react';

export interface Column {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'status' | 'badge' | 'avatar' | 'currency' | 'image' | 'file';
  render?: (value: any, record: any) => React.ReactNode;
}

interface GanovaGridProps {
  title: string;
  columns: Column[];
  data: any[];
  loading?: boolean;
  onAdd?: () => void;
  onEdit?: (record: any) => void;
  onDelete?: (record: any) => void;
  entityName?: string;
  // Permissions
  canAdd?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  // Custom Actions
  rowActions?: { label: string; icon: React.FC<any>; onClick: (record: any) => void; color?: string }[];
}

export default function GanovaGrid({
  title,
  columns,
  data,
  loading,
  onAdd,
  onEdit,
  onDelete,
  entityName = 'record',
  canAdd = true,
  canEdit = true,
  canDelete = true,
  rowActions = []
}: GanovaGridProps) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const filteredData = (data || []).filter(item => 
    Object.values(item || {}).some(val => 
      String(val).toLowerCase().includes(search.toLowerCase())
    )
  );

  const sortedData = [...filteredData].sort((a, b) => {
    if (!sortKey) return 0;
    const valA = a[sortKey];
    const valB = b[sortKey];
    if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
    if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  const paginatedData = sortedData.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.ceil(sortedData.length / pageSize);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('asc');
    }
  };

  const renderCell = (col: Column, record: any) => {
    const value = record[col.key];
    if (col.render) return col.render(value, record);

    switch (col.type) {
      case 'badge':
        return (
          <div className="flex flex-wrap gap-1">
            {String(value).split(',').filter(Boolean).map((v, i) => (
              <span key={i} className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
                {v.trim()}
              </span>
            ))}
          </div>
        );
      case 'status':
        return (
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
            String(value).toLowerCase().includes('active') || String(value).toLowerCase().includes('paid') || String(value).toLowerCase().includes('approved')
              ? 'bg-green-500/20 text-green-400'
              : String(value).toLowerCase().includes('pending') || String(value).toLowerCase().includes('paused')
              ? 'bg-yellow-500/20 text-yellow-400'
              : 'bg-red-500/20 text-red-400'
          }`}>
            {value}
          </span>
        );
      case 'avatar':
        return (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center font-bold text-xs">
              {String(value).charAt(0).toUpperCase()}
            </div>
            <span className="text-sm font-medium">{value}</span>
          </div>
        );
      case 'currency':
        return <span className="font-mono text-sm">${Number(value).toLocaleString()}</span>;
      case 'date':
        return <span className="text-sm text-textSecondary">{value ? new Date(value).toLocaleDateString() : '—'}</span>;
      case 'image':
        return value ? (
          <div className="w-10 h-10 rounded-lg overflow-hidden border border-white/10 bg-white/5">
            <img src={value} alt="Preview" className="w-full h-full object-cover" />
          </div>
        ) : <div className="w-10 h-10 rounded-lg bg-white/5 border border-dashed border-white/10" />;
      case 'file':
        return value ? (
          <a href={value} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-primary hover:underline">
            <FileText className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-widest">View File</span>
          </a>
        ) : <span className="text-xs text-textSecondary italic">No File</span>;
      default:
        return <span className="text-sm">{value}</span>;
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">{title}</h2>
          <p className="text-sm text-textSecondary">{sortedData.length} {entityName}{sortedData.length !== 1 ? 's' : ''} available</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative group">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-textSecondary group-focus-within:text-primary transition-colors" />
            <input 
              type="text" 
              placeholder="Search records..." 
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="bg-surface/50 border border-white/10 rounded-full pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-primary/50 w-full md:w-64 transition-all"
            />
          </div>
          
          <button className="p-2 rounded-full border border-white/10 hover:bg-white/5 text-textSecondary transition-colors" title="Filter">
            <Filter className="w-4 h-4" />
          </button>
          
          <button className="p-2 rounded-full border border-white/10 hover:bg-white/5 text-textSecondary transition-colors" title="Export">
            <Download className="w-4 h-4" />
          </button>

          {onAdd && canAdd && (
            <button 
              onClick={onAdd}
              className="flex items-center gap-2 px-5 py-2 rounded-full bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" /> Add {entityName}
            </button>
          )}
        </div>
      </div>

      {/* Grid Content */}
      <div className="glass-panel rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/5 border-b border-white/10">
                {columns.map(col => (
                  <th 
                    key={col.key} 
                    className="p-4 text-[10px] font-black text-textSecondary uppercase tracking-[0.15em] cursor-pointer hover:text-primary transition-colors group"
                    onClick={() => handleSort(col.key)}
                  >
                    <div className="flex items-center gap-2">
                      {col.label}
                      <ArrowUpDown className={`w-3 h-3 transition-opacity ${sortKey === col.key ? 'text-primary opacity-100' : 'opacity-0 group-hover:opacity-100'}`} />
                    </div>
                  </th>
                ))}
                {(onEdit || onDelete || rowActions.length > 0) && (
                  <th className="p-4 text-[10px] font-black text-textSecondary uppercase tracking-[0.15em] text-right">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={columns.length + (onEdit || onDelete || rowActions.length > 0 ? 1 : 0)} className="p-12 text-center text-textSecondary">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm font-medium">Synchronizing {entityName}s...</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + (onEdit || onDelete || rowActions.length > 0 ? 1 : 0)} className="p-12 text-center text-textSecondary">
                    <div className="flex flex-col items-center gap-3">
                      <FileText className="w-12 h-12 opacity-10" />
                      <span className="text-sm font-medium italic">No matching records found in this view.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedData.map((record, idx) => (
                  <tr key={record.id || idx} className="group hover:bg-white/[0.03] transition-colors">
                    {columns.map(col => (
                      <td key={col.key} className="p-4">
                        {renderCell(col, record)}
                      </td>
                    ))}
                    {(onEdit || onDelete || rowActions.length > 0) && (
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {rowActions.map((action, actionIdx) => (
                            <button 
                              key={actionIdx}
                              onClick={(e) => { e.stopPropagation(); action.onClick(record); }}
                              className={`p-2 rounded-lg transition-all ${action.color || 'text-textSecondary hover:text-primary hover:bg-primary/10'}`}
                              title={action.label}
                            >
                              <action.icon className="w-4 h-4" />
                            </button>
                          ))}
                          {onEdit && canEdit && (
                            <button onClick={(e) => { e.stopPropagation(); onEdit(record); }} className="p-2 text-textSecondary hover:text-primary hover:bg-primary/10 rounded-lg transition-all" title="Edit">
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                          {onDelete && canDelete && (
                            <button onClick={(e) => { e.stopPropagation(); onDelete(record); }} className="p-2 text-textSecondary hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all" title="Delete">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          {!canEdit && !canDelete && rowActions.length === 0 && <span className="text-[10px] text-textSecondary italic pr-2">Read-only</span>}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 bg-white/5 border-t border-white/10 flex items-center justify-between">
            <p className="text-xs text-textSecondary font-medium">
              Showing <span className="text-white">{(page - 1) * pageSize + 1}</span> to <span className="text-white">{Math.min(page * pageSize, sortedData.length)}</span> of <span className="text-white">{sortedData.length}</span> records
            </p>
            <div className="flex gap-2">
              <button 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-xl border border-white/10 hover:bg-white/10 disabled:opacity-30 transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 rounded-xl border border-white/10 hover:bg-white/10 disabled:opacity-30 transition-all"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
