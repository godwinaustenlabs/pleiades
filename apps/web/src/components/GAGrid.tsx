import React, { useState } from 'react';
import { Search, Filter, ArrowUpDown, Plus, Edit2, Trash2, Download, FileText, ChevronLeft, ChevronRight, Maximize2, Upload } from 'lucide-react';
import AssetPreviewModal from './AssetPreviewModal';
import { token } from '../lib/auth';

export interface Column {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'status' | 'badge' | 'avatar' | 'currency' | 'image' | 'file';
  render?: (value: any, record: any) => React.ReactNode;
}

interface GAGridProps {
  title: string;
  columns: Column[];
  data: any[];
  loading?: boolean;
  onAdd?: () => void;
  onEdit?: (record: any) => void;
  onDelete?: (record: any) => void;
  onImport?: (file: File) => void;
  entityName?: string;
  // Permissions
  canAdd?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  // Custom Actions
  rowActions?: { label: string; icon: React.FC<any>; onClick: (record: any) => void; color?: string }[];
}

export default function GAGrid({
  title,
  columns,
  data,
  loading,
  onAdd,
  onEdit,
  onDelete,
  onImport,
  entityName = 'record',
  canAdd = true,
  canEdit = true,
  canDelete = true,
  rowActions = []
}: GAGridProps) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const pageSize = 10;

  const filteredData = (data || []).filter(item => 
    item && Object.values(item).some(val => 
      String(val || '').toLowerCase().includes(search.toLowerCase())
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

  const isImage = (url: string) => /\.(jpg|jpeg|png|gif|webp)$|^data:image/i.test(url);

  const renderCell = (col: Column, record: any) => {
    const value = record[col.key];
    if (col.render) return col.render(value, record);

    switch (col.type) {
      case 'badge': {
        const tags = String(value || '').split(',').filter(Boolean).map(v => v.trim());
        return (
          <div className="flex flex-wrap gap-1 max-w-[200px]">
            {tags.slice(0, 3).map((v, i) => (
              <span key={i} className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-primary/10 text-primary border border-primary/20 whitespace-nowrap">
                {v}
              </span>
            ))}
            {tags.length > 3 && (
              <span className="px-2 py-1 rounded-full text-[9px] font-black bg-white/5 text-textSecondary border border-white/10 whitespace-nowrap">
                +{tags.length - 3}
              </span>
            )}
          </div>
        );
      }
      case 'status':
        return (
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
            String(value || '').toLowerCase().includes('active') || String(value || '').toLowerCase().includes('paid') || String(value || '').toLowerCase().includes('approved')
              ? 'bg-green-500/20 text-green-400'
              : String(value || '').toLowerCase().includes('pending') || String(value || '').toLowerCase().includes('paused')
              ? 'bg-yellow-500/20 text-yellow-400'
              : 'bg-red-500/20 text-red-400'
          }`}>
            {value}
          </span>
        );
      case 'avatar': {
        const photoUrl = record.profilePhoto || record.photoUrl;
        const fullPhotoUrl = photoUrl ? (
          photoUrl.startsWith('http') || photoUrl.startsWith('/api') 
            ? photoUrl 
            : `/api/assets/download/${photoUrl.startsWith('/') ? photoUrl.slice(1) : photoUrl}`
        ) : null;
        return (
          <div className="flex items-center gap-3 min-w-[140px]">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary to-accent flex items-center justify-center font-bold text-xs shrink-0 shadow-lg shadow-primary/20 overflow-hidden border border-white/10">
              {fullPhotoUrl ? (
                <img src={fullPhotoUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                String(value).charAt(0).toUpperCase()
              )}
            </div>
            <span className="text-sm font-bold text-white whitespace-nowrap">{value}</span>
          </div>
        );
      }
      case 'currency':
        return <span className="font-mono text-sm">${Number(value).toLocaleString()}</span>;
      case 'date':
        return <span className="text-sm text-textSecondary">{value ? new Date(value).toLocaleDateString() : '—'}</span>;
      case 'image':
      case 'file': {
        if (!value) return <span className="text-xs text-textSecondary italic">No File</span>;
        
        const authenticatedUrl = String(value).startsWith('/api/') 
          ? `${value}?token=${token()}` 
          : value;

        if (isImage(value)) {
          return (
            <div 
              onClick={() => setPreviewUrl(authenticatedUrl)}
              className="relative w-12 h-12 rounded-xl overflow-hidden border border-white/10 bg-white/5 cursor-pointer group/thumb shadow-sm hover:border-primary/50 transition-all"
            >
              <img src={authenticatedUrl} alt="Thumbnail" className="w-full h-full object-cover transition-transform duration-500 group-hover/thumb:scale-110" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center transition-opacity">
                <Maximize2 className="w-4 h-4 text-white" />
              </div>
            </div>
          );
        }

        return (
          <button 
            onClick={() => setPreviewUrl(authenticatedUrl)}
            className="flex items-center gap-2.5 p-2 rounded-xl bg-white/5 border border-white/10 hover:border-primary/50 hover:bg-primary/5 transition-all text-textSecondary hover:text-primary group/file"
          >
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center group-hover/file:bg-primary/20 transition-colors">
              <FileText className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest truncate max-w-[80px]">View</span>
          </button>
        );
      }
      default:
        return <span className="text-sm">{value}</span>;
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight">{title}</h2>
          <p className="text-xs md:text-sm text-textSecondary">{sortedData.length} {entityName}{sortedData.length !== 1 ? 's' : ''} available</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative group flex-1 sm:flex-initial">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-textSecondary group-focus-within:text-primary transition-colors" />
            <input 
              type="text" 
              placeholder="Search..." 
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="bg-surface/50 border border-white/10 rounded-full pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-primary/50 w-full sm:w-48 md:w-64 transition-all"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <button className="flex-1 sm:flex-none p-2 rounded-xl border border-white/10 hover:bg-white/5 text-textSecondary transition-colors flex items-center justify-center" title="Filter">
              <Filter className="w-4 h-4" />
            </button>
            
            <button className="flex-1 sm:flex-none p-2 rounded-xl border border-white/10 hover:bg-white/5 text-textSecondary transition-colors flex items-center justify-center" title="Export">
              <Download className="w-4 h-4" />
            </button>

            {onImport && canAdd && (
              <div className="relative flex-1 sm:flex-none">
                <input 
                  type="file" 
                  accept=".csv" 
                  onChange={(e) => {
                    if (e.target.files?.[0]) onImport(e.target.files[0]);
                    e.target.value = '';
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <button className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-bold transition-all border border-white/10 group">
                  <Upload className="w-4 h-4 text-textSecondary group-hover:text-primary transition-colors" />
                  <span className="hidden lg:inline">Import</span>
                </button>
              </div>
            )}
          </div>

          {onAdd && canAdd && (
            <button 
              onClick={onAdd}
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" /> <span>Add {entityName}</span>
            </button>
          )}
        </div>
      </div>

      {/* Grid Content */}
      <div className="rounded-3xl overflow-hidden border border-white/10 shadow-2xl bg-white/[0.02]">
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
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
                  <tr key={record?.id || idx} className="group hover:bg-white/[0.03] transition-colors">
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

        {/* Mobile Card View */}
        <div className="md:hidden divide-y divide-white/5">
          {loading ? (
            <div className="p-8 text-center text-textSecondary">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-black uppercase tracking-widest">Synchronizing...</span>
              </div>
            </div>
          ) : paginatedData.length === 0 ? (
            <div className="p-12 text-center text-textSecondary">
              <div className="flex flex-col items-center gap-3">
                <FileText className="w-12 h-12 opacity-10" />
                <span className="text-sm font-medium italic">No records found.</span>
              </div>
            </div>
          ) : (
            paginatedData.map((record, idx) => (
              <div key={record?.id || idx} className="p-4 space-y-4 bg-white/[0.01]">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    {/* Primary Info (First Column) */}
                    <div className="font-bold text-white break-all max-w-full text-xs">
                      {renderCell(columns[0], record)}
                    </div>
                    
                    {/* Other Info Grid */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                      {columns.slice(1).map(col => (
                        <div key={col.key} className="space-y-1">
                          <div className="text-[10px] font-black uppercase tracking-wider text-textSecondary opacity-60">
                            {col.label}
                          </div>
                          <div className="text-sm break-all max-w-full">
                            {renderCell(col, record)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Mobile Actions */}
                  <div className="flex flex-col gap-2">
                    {onEdit && canEdit && (
                      <button onClick={() => onEdit(record)} className="p-2.5 bg-primary/10 text-primary rounded-xl transition-all active:scale-95">
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                    {onDelete && canDelete && (
                      <button onClick={() => onDelete(record)} className="p-2.5 bg-red-400/10 text-red-400 rounded-xl transition-all active:scale-95">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                
                {/* Extra Actions row if any */}
                {rowActions.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
                    {rowActions.map((action, actionIdx) => (
                      <button 
                        key={actionIdx}
                        onClick={() => action.onClick(record)}
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 ${action.color || 'bg-white/5 text-textSecondary border border-white/10'}`}
                      >
                        <action.icon className="w-3.5 h-3.5" />
                        <span>{action.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
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

      {/* Preview Modal */}
      <AssetPreviewModal 
        url={previewUrl} 
        onClose={() => setPreviewUrl(null)} 
        type={previewUrl && /\.(pdf)(\?|$)/i.test(previewUrl) ? 'pdf' : 'image'} 
      />
    </div>
  );
}
