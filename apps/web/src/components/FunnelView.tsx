import React, { useState } from 'react';
import { Target, Plus, Edit2, Trash2, ArrowDown } from 'lucide-react';

interface KPI {
  name: string;
  value: number;
}

interface Stage {
  name: string;
  value?: number;
  kpis?: KPI[];
}

interface FunnelData {
  id: string;
  funnelName: string;
  campaignId: string;
  conversionRatePct: number;
  stages: string | Stage[];
  leadEntryCount: number;
  conversions: number;
}

interface FunnelViewProps {
  funnels: FunnelData[];
  onAdd: () => void;
  onEdit: (funnel: FunnelData) => void;
  onDelete: (funnel: FunnelData) => void;
  canEdit: boolean;
  canDelete: boolean;
}

export default function FunnelView({ funnels, onAdd, onEdit, onDelete, canEdit, canDelete }: FunnelViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(funnels.length > 0 ? funnels[0].id : null);

  const selectedFunnel = funnels.find(f => f.id === selectedId) || funnels[0];

  const renderFunnelVisual = (funnel: FunnelData) => {
    let stages: Stage[] = [];
    try {
      stages = typeof funnel.stages === 'string' ? JSON.parse(funnel.stages) : funnel.stages;
      if (!Array.isArray(stages)) stages = [{ name: 'Awareness' }, { name: 'Consideration' }, { name: 'Decision' }];
    } catch {
      stages = [{ name: 'Awareness' }, { name: 'Consideration' }, { name: 'Decision' }];
    }

    // Default width ratios for the funnel shape
    const topWidth = 100;
    const bottomWidth = 30;
    const dropPerStage = (topWidth - bottomWidth) / (stages.length - 1 || 1);

    return (
      <div className="flex flex-col items-center justify-center w-full max-w-lg mx-auto py-8 space-y-2">
        {stages.map((stage, i) => {
          const currentWidth = topWidth - (dropPerStage * i);
          const isLast = i === stages.length - 1;
          return (
            <React.Fragment key={i}>
              <div 
                className="bg-gradient-to-r from-rose-500/80 to-pink-500/80 rounded-xl flex items-center justify-center shadow-lg shadow-rose-500/20 border border-white/20 backdrop-blur-md relative group transition-all duration-300 hover:scale-105"
                style={{ 
                  width: `${currentWidth}%`, 
                  minHeight: '80px',
                  padding: '1rem',
                  clipPath: 'polygon(5% 0%, 95% 0%, 100% 100%, 0% 100%)'
                }}
              >
                <div className="text-center w-full">
                  <p className="text-white font-black uppercase tracking-widest text-sm drop-shadow-md">{stage.name}</p>
                  {stage.value !== undefined && <p className="text-white/80 text-xs font-bold">{stage.value.toLocaleString()}</p>}
                  {stage.kpis && stage.kpis.length > 0 && (
                    <div className="flex flex-wrap items-center justify-center gap-6 mt-3 border-t border-white/20 pt-2">
                      {stage.kpis.map((kpi, idx) => (
                        <div key={idx} className="flex flex-col items-center">
                          <span className="text-[9px] uppercase tracking-widest text-white/70 font-black">{kpi.name}</span>
                          <span className="text-white text-sm font-bold">{kpi.value.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {!isLast && <ArrowDown className="w-5 h-5 text-rose-500/50 animate-bounce" />}
            </React.Fragment>
          );
        })}
        
        <div className="mt-8 pt-8 border-t border-white/10 w-full text-center flex justify-around">
          <div>
            <p className="text-textSecondary text-[10px] font-black uppercase tracking-widest">Total Entries</p>
            <p className="text-2xl font-black text-white">{funnel.leadEntryCount || 0}</p>
          </div>
          <div>
            <p className="text-textSecondary text-[10px] font-black uppercase tracking-widest">Conversions</p>
            <p className="text-2xl font-black text-emerald-400">{funnel.conversions || 0}</p>
          </div>
          <div>
            <p className="text-textSecondary text-[10px] font-black uppercase tracking-widest">Conv. Rate</p>
            <p className="text-2xl font-black text-rose-400">{funnel.conversionRatePct || 0}%</p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="glass-panel border border-white/10 rounded-[2.5rem] overflow-hidden flex flex-col md:flex-row min-h-[600px] animate-in fade-in duration-700 shadow-2xl">
      {/* Sidebar List */}
      <div className="w-full md:w-80 border-r border-white/5 bg-white/[0.02] flex flex-col">
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Target className="w-5 h-5 text-rose-400" />
            <h3 className="font-black text-lg tracking-tight">Funnels</h3>
          </div>
          {canEdit && (
            <button onClick={onAdd} className="p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-all">
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {funnels.length === 0 ? (
            <div className="text-center p-8 text-textSecondary text-sm">No funnels created yet.</div>
          ) : (
            funnels.map(f => (
              <button
                key={f.id}
                onClick={() => setSelectedId(f.id)}
                className={`w-full text-left p-4 rounded-2xl transition-all border ${
                  selectedId === f.id 
                    ? 'bg-rose-500/10 border-rose-500/20 shadow-lg shadow-rose-500/5' 
                    : 'bg-white/5 border-transparent hover:bg-white/10'
                }`}
              >
                <p className="font-bold text-sm truncate">{f.funnelName}</p>
                <p className="text-xs text-textSecondary mt-1">Rate: {f.conversionRatePct || 0}%</p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main Visualization Area */}
      <div className="flex-1 bg-surface/30 p-8 flex flex-col">
        {selectedFunnel ? (
          <>
            <div className="flex justify-between items-start mb-8">
              <div>
                <h2 className="text-3xl font-black tracking-tighter text-white">{selectedFunnel.funnelName}</h2>
                <p className="text-textSecondary text-xs uppercase tracking-widest font-bold mt-2">Interactive Pipeline Visualization</p>
              </div>
              <div className="flex gap-2">
                {canEdit && (
                  <button onClick={() => onEdit(selectedFunnel)} className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl transition-all flex items-center gap-2 text-sm font-bold">
                    <Edit2 className="w-4 h-4" /> Edit
                  </button>
                )}
                {canDelete && (
                  <button onClick={() => onDelete(selectedFunnel)} className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl transition-all flex items-center gap-2 text-sm font-bold">
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 flex items-center justify-center">
              {renderFunnelVisual(selectedFunnel)}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-textSecondary">
            <Target className="w-16 h-16 opacity-20 mb-4" />
            <p>Select a funnel to view its visualization</p>
          </div>
        )}
      </div>
    </div>
  );
}
