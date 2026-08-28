import React, { useState, useEffect } from 'react';
import { Target, Plus, Edit2, Trash2, DollarSign, Loader2 } from 'lucide-react';
import EntityForm from './EntityForm';
import { API, token } from '../lib/auth';

interface DealStage {
  id: string;
  pipelineId: string;
  stageName: string;
  orderIndex: number;
}

interface Deal {
  id: string;
  dealName: string;
  amount: number;
  pipelineId: string;
  stageId: string;
  contactId?: string;
  closeDate?: string;
  owner?: string;
  contact?: { fullName: string; companyName: string };
}

interface DealPipeline {
  id: string;
  pipelineName: string;
  dealStages?: DealStage[];
}

interface DealPipelineViewProps {
  canEdit: boolean;
  canDelete: boolean;
}


export default function DealPipelineView({ canEdit, canDelete }: DealPipelineViewProps) {
  const [pipelines, setPipelines] = useState<DealPipeline[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [employees, setEmployees] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);

  const [showPipelineForm, setShowPipelineForm] = useState(false);
  const [editingPipeline, setEditingPipeline] = useState<DealPipeline | null>(null);

  const [showStageForm, setShowStageForm] = useState(false);
  const [editingStage, setEditingStage] = useState<DealStage | null>(null);

  const [showDealForm, setShowDealForm] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);

  const [customPipelineName, setCustomPipelineName] = useState('');
  const [customStages, setCustomStages] = useState<{name: string}[]>([{name: 'Lead In'}, {name: 'Contact Made'}, {name: 'Proposal'}, {name: 'Closed Won'}]);
  const [isSubmittingPipeline, setIsSubmittingPipeline] = useState(false);

  const fetchPipelines = async () => {
    try {
      const res = await fetch(`${API}/acquisition/deal-pipelines`, { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json();
      setPipelines(data.data || []);
      if (!selectedPipelineId && data.data?.length > 0) {
        setSelectedPipelineId(data.data[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchDeals = async (pipelineId: string) => {
    try {
      setLoading(true);
      const res = await fetch(`${API}/acquisition/deals?pipeline_id=${pipelineId}`, { headers: { Authorization: `Bearer ${token()}` } });
      const data = await res.json();
      setDeals(data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPipelines();
    
    // Fetch users for owner dropdown
    fetch(`${API}/acquisition/users`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(res => res.json())
      .then(data => setEmployees(data.data || []))
      .catch(console.error);

    // Fetch contacts for lead dropdown
    fetch(`${API}/acquisition/contacts`, { headers: { Authorization: `Bearer ${token()}` } })
      .then(res => res.json())
      .then(data => setContacts(data.data || []))
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (selectedPipelineId) {
      fetchDeals(selectedPipelineId);
    }
  }, [selectedPipelineId]);

  const selectedPipeline = pipelines.find(p => p.id === selectedPipelineId);
  const stages = selectedPipeline?.dealStages || [];

  const handleDragStart = (e: React.DragEvent, dealId: string) => {
    e.dataTransfer.setData('dealId', dealId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    const dealId = e.dataTransfer.getData('dealId');
    if (!dealId) return;

    const dealToUpdate = deals.find(d => d.id === dealId);
    if (!dealToUpdate || dealToUpdate.stageId === stageId) return;

    // Optimistic UI update
    setDeals(prev => prev.map(d => d.id === dealId ? { ...d, stageId } : d));

    try {
      await fetch(`${API}/acquisition/deals/${dealId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ stageId })
      });
    } catch (err) {
      console.error("Failed to update deal stage", err);
      // Revert on error
      fetchDeals(selectedPipelineId!);
    }
  };

  const handleDeletePipeline = async (id: string) => {
    if (!confirm('Delete pipeline and all its stages and deals?')) return;
    await fetch(`${API}/acquisition/deal-pipelines/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
    setSelectedPipelineId(null);
    fetchPipelines();
  };

  const handleDeleteStage = async (id: string) => {
    if (!confirm('Delete stage and all its deals?')) return;
    await fetch(`${API}/acquisition/deal-stages/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
    fetchPipelines();
  };

  const handleDeleteDeal = async (id: string) => {
    if (!confirm('Delete deal?')) return;
    await fetch(`${API}/acquisition/deals/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } });
    fetchDeals(selectedPipelineId!);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-160px)] -mt-4 -mb-4 -mx-4 md:-mx-8">
      {/* Header */}
      <div className="flex items-center justify-between p-4 md:px-8 border-b border-white/5 bg-surface/30 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-4">
          <select 
            value={selectedPipelineId || ''} 
            onChange={(e) => setSelectedPipelineId(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm font-bold text-white focus:outline-none focus:border-module min-w-[200px]"
          >
            {pipelines.length === 0 && <option value="">No Pipelines</option>}
            {pipelines.map(p => (
              <option key={p.id} value={p.id}>{p.pipelineName}</option>
            ))}
          </select>

          {canEdit && selectedPipelineId && (
            <button onClick={() => { 
              setEditingPipeline(selectedPipeline!); 
              setCustomPipelineName(selectedPipeline!.pipelineName);
              setCustomStages(selectedPipeline!.dealStages?.map(s => ({name: s.stageName})) || []);
              setShowPipelineForm(true); 
            }} className="p-2 text-textSecondary hover:text-white transition-all">
              <Edit2 className="w-4 h-4" />
            </button>
          )}
          {canDelete && selectedPipelineId && (
            <button onClick={() => handleDeletePipeline(selectedPipelineId)} className="p-2 text-textSecondary hover:text-danger transition-all">
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          {canEdit && (
            <button onClick={() => { 
              setEditingPipeline(null); 
              setCustomPipelineName('');
              setCustomStages([{name: 'Lead In'}, {name: 'Contact Made'}, {name: 'Proposal'}, {name: 'Closed Won'}]);
              setShowPipelineForm(true); 
            }} className="flex items-center gap-2 px-3 py-1.5 bg-module/10 text-module border border-module/20 rounded-xl hover:bg-module/20 transition-all text-xs font-bold uppercase tracking-wider">
              <Plus className="w-3 h-3" /> New Pipeline
            </button>
          )}
        </div>
        
        {canEdit && selectedPipelineId && (
          <div className="flex gap-2">
            <button onClick={() => { setEditingStage(null); setShowStageForm(true); }} className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all text-sm font-bold text-white">
              <Plus className="w-4 h-4" /> Add Stage
            </button>
            <button onClick={() => { setEditingDeal(null); setShowDealForm(true); }} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-module to-module hover:from-module hover:to-module border border-module/50 shadow-lg shadow-module/20 rounded-xl transition-all text-sm font-bold text-white">
              <Plus className="w-4 h-4" /> New Deal
            </button>
          </div>
        )}
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto p-4 md:p-8 hide-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 text-module animate-spin" />
          </div>
        ) : !selectedPipeline ? (
          <div className="flex flex-col items-center justify-center h-full text-textSecondary">
            <Target className="w-16 h-16 opacity-20 mb-4" />
            <p>Select or create a pipeline to get started</p>
          </div>
        ) : stages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-textSecondary">
            <p className="mb-4">This pipeline has no stages.</p>
            {canEdit && (
              <button onClick={() => { setEditingStage(null); setShowStageForm(true); }} className="px-6 py-2 bg-module/20 text-module rounded-xl font-bold">
                Add First Stage
              </button>
            )}
          </div>
        ) : (
          <div className="flex gap-6 h-full pb-4">
            {stages.map(stage => {
              const stageDeals = deals.filter(d => d.stageId === stage.id);
              const stageTotal = stageDeals.reduce((sum, d) => sum + (d.amount || 0), 0);
              
              return (
                <div 
                  key={stage.id}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, stage.id)}
                  className="flex flex-col w-[320px] shrink-0 bg-white/[0.02] border border-white/5 rounded-3xl"
                >
                  <div className="p-4 border-b border-white/5 flex items-center justify-between group">
                    <div>
                      <h3 className="font-black text-sm uppercase tracking-widest text-white">{stage.stageName} <span className="text-textSecondary ml-1">({stageDeals.length})</span></h3>
                      <p className="text-module font-bold text-xs mt-1 flex items-center"><DollarSign className="w-3 h-3 mr-0.5" />{stageTotal.toLocaleString()}</p>
                    </div>
                    {canEdit && (
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                        <button onClick={() => { setEditingStage(stage); setShowStageForm(true); }} className="p-1.5 text-textSecondary hover:text-white rounded-lg hover:bg-white/5"><Edit2 className="w-3 h-3" /></button>
                        <button onClick={() => handleDeleteStage(stage.id)} className="p-1.5 text-textSecondary hover:text-danger rounded-lg hover:bg-white/5"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 p-3 overflow-y-auto space-y-3 custom-scrollbar">
                    {stageDeals.map(deal => (
                      <div 
                        key={deal.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, deal.id)}
                        className="bg-surface/50 border border-white/10 p-4 rounded-2xl cursor-grab active:cursor-grabbing hover:border-module/50 hover:shadow-lg hover:shadow-module/10 transition-all group"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-bold text-sm text-white line-clamp-2">{deal.dealName}</h4>
                          {canEdit && (
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 -mt-1 -mr-1">
                              <button onClick={() => { setEditingDeal(deal); setShowDealForm(true); }} className="p-1 text-textSecondary hover:text-white" title="Edit Deal"><Edit2 className="w-3 h-3" /></button>
                              {canDelete && (
                                <button onClick={() => handleDeleteDeal(deal.id)} className="p-1 text-textSecondary hover:text-danger" title="Delete Deal"><Trash2 className="w-3 h-3" /></button>
                              )}
                            </div>
                          )}
                        </div>
                        <p className="text-success font-bold text-sm flex items-center mb-3"><DollarSign className="w-3 h-3 mr-0.5" />{(deal.amount || 0).toLocaleString()}</p>
                        
                        {(deal.contact || deal.owner || deal.closeDate) && (
                          <div className="pt-3 border-t border-white/5 space-y-1.5">
                            {deal.contact && <p className="text-xs text-textSecondary"><span className="text-white/40">Contact:</span> {deal.contact.fullName}</p>}
                            {deal.owner && <p className="text-xs text-textSecondary"><span className="text-white/40">Owner:</span> {deal.owner}</p>}
                            {deal.closeDate && <p className="text-xs text-textSecondary"><span className="text-white/40">Close:</span> {new Date(deal.closeDate).toLocaleDateString()}</p>}
                          </div>
                        )}
                      </div>
                    ))}
                    {stageDeals.length === 0 && (
                      <div className="h-24 border-2 border-dashed border-white/10 rounded-2xl flex items-center justify-center text-textSecondary/50 text-xs">
                        Drop deals here
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Forms */}
      {showPipelineForm && (
        <div className="fixed inset-0 scrim z-[100] flex items-center justify-center p-4">
          <div className="modal-panel w-full max-w-lg rounded-3xl border border-white/10 p-6 md:p-8 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <h2 className="text-2xl font-black mb-6">{editingPipeline ? "Edit Pipeline Setup" : "Create New Pipeline"}</h2>
            
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-textSecondary uppercase tracking-wider mb-2">Pipeline Name</label>
                <input 
                  type="text" 
                  value={customPipelineName}
                  onChange={(e) => setCustomPipelineName(e.target.value)}
                  className="w-full bg-surfaceAlt border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-module transition-colors"
                  placeholder="e.g. Enterprise Sales"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-textSecondary uppercase tracking-wider mb-2">Pipeline Stages</label>
                <div className="space-y-3">
                  {customStages.map((stage, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-xs font-bold text-textSecondary border border-white/10 shrink-0">
                        {i + 1}
                      </div>
                      <input 
                        type="text" 
                        value={stage.name}
                        onChange={(e) => {
                          const newStages = [...customStages];
                          newStages[i].name = e.target.value;
                          setCustomStages(newStages);
                        }}
                        className="flex-1 bg-surfaceAlt border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-module transition-colors"
                        placeholder="Stage Name"
                      />
                      <button 
                        onClick={() => setCustomStages(customStages.filter((_, idx) => idx !== i))}
                        className="p-2 text-textSecondary hover:text-danger hover:bg-white/5 rounded-xl transition-colors shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button 
                    onClick={() => setCustomStages([...customStages, {name: ''}])}
                    className="flex items-center gap-2 text-sm font-bold text-module hover:text-module mt-2 px-2"
                  >
                    <Plus className="w-4 h-4" /> Add Stage
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-white/10">
                <button 
                  onClick={() => setShowPipelineForm(false)}
                  className="px-6 py-2.5 rounded-xl font-bold text-sm bg-white/5 hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={async () => {
                    if (!customPipelineName.trim()) return alert("Pipeline Name is required");
                    setIsSubmittingPipeline(true);
                    try {
                      // 1. Create or Update Pipeline
                      const method = editingPipeline ? 'PATCH' : 'POST';
                      const url = editingPipeline ? `${API}/acquisition/deal-pipelines/${editingPipeline.id}` : `${API}/acquisition/deal-pipelines`;
                      const res = await fetch(url, { 
                        method, 
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, 
                        body: JSON.stringify({ pipelineName: customPipelineName }) 
                      });
                      const pipData = await res.json();
                      const pipelineId = editingPipeline ? editingPipeline.id : pipData.data.id;

                      // 2. If it's a new pipeline, create the stages
                      if (!editingPipeline && pipelineId) {
                        for (let i = 0; i < customStages.length; i++) {
                          if (!customStages[i].name.trim()) continue;
                          await fetch(`${API}/acquisition/deal-stages`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                            body: JSON.stringify({
                              pipelineId,
                              stageName: customStages[i].name,
                              orderIndex: i + 1
                            })
                          });
                        }
                      }
                      
                      setShowPipelineForm(false);
                      await fetchPipelines();
                      if (!editingPipeline) setSelectedPipelineId(pipelineId);
                    } catch (err) {
                      console.error("Failed to save pipeline", err);
                      alert("An error occurred. Check the console.");
                    } finally {
                      setIsSubmittingPipeline(false);
                    }
                  }}
                  disabled={isSubmittingPipeline}
                  className="px-6 py-2.5 rounded-xl font-bold text-sm bg-module hover:bg-moduleHover text-surface transition-colors flex items-center gap-2"
                >
                  {isSubmittingPipeline && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingPipeline ? "Save Changes" : "Create Pipeline"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showStageForm && (
        <EntityForm
          title={editingStage ? "Edit Stage" : "New Stage"}
          fields={[
            { key: 'stageName', label: 'Stage Name', type: 'text', required: true },
            { key: 'orderIndex', label: 'Order (1, 2, 3...)', type: 'number', required: true }
          ]}
          initialData={editingStage || { orderIndex: (stages.length || 0) + 1 }}
          onClose={() => setShowStageForm(false)}
          onSubmit={async (data) => {
            const method = editingStage ? 'PATCH' : 'POST';
            const url = editingStage ? `${API}/acquisition/deal-stages/${editingStage.id}` : `${API}/acquisition/deal-stages`;
            await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify({ ...data, pipelineId: selectedPipelineId }) });
            setShowStageForm(false);
            fetchPipelines();
          }}
        />
      )}

      {showDealForm && (
        <EntityForm
          title={editingDeal ? "Edit Deal" : "New Deal"}
          fields={[
            { key: 'dealName', label: 'Deal Name', type: 'text', required: true },
            { key: 'amount', label: 'Amount ($)', type: 'number' },
            { key: 'stageId', label: 'Pipeline Stage', type: 'select', options: stages.map(s => ({ value: s.id, label: s.stageName })), required: true },
            { key: 'contactId', label: 'Lead / Contact', type: 'select', options: contacts.map(c => ({ value: c.id, label: c.fullName + (c.companyName ? ` (${c.companyName})` : '') })) },
            { key: 'owner', label: 'Deal Owner', type: 'select', options: employees.map(e => ({ value: e.name || e.email, label: e.name || e.email })) },
            { key: 'closeDate', label: 'Expected Close Date', type: 'date' },
            { key: 'notes', label: 'Notes', type: 'textarea' },
          ]}
          initialData={editingDeal || (stages.length > 0 ? { stageId: stages[0].id } : {})}
          onClose={() => setShowDealForm(false)}
          onSubmit={async (data) => {
            const method = editingDeal ? 'PATCH' : 'POST';
            const url = editingDeal ? `${API}/acquisition/deals/${editingDeal.id}` : `${API}/acquisition/deals`;
            await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify({ ...data, pipelineId: selectedPipelineId }) });
            setShowDealForm(false);
            fetchDeals(selectedPipelineId!);
          }}
        />
      )}
    </div>
  );
}
