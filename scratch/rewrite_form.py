import re

with open('scratch/HR_EmployeeForm.txt', 'r') as f:
    code = f.read()

# 1. Update EmployeeFormProps
props_target = """interface EmployeeFormProps {
  initialData: any;
  appointments: any[];
  onClose: () => void;"""
props_replacement = """interface EmployeeFormProps {
  initialData: any;
  appointments: any[];
  employees: any[];
  onClose: () => void;"""
code = code.replace(props_target, props_replacement)

# 2. Update EmployeeForm signature
sig_target = """function EmployeeForm({ initialData, appointments, onClose, onSubmit, onAddAppointment, onEditAppointment, canEditPermissions }: EmployeeFormProps) {"""
sig_replacement = """function EmployeeForm({ initialData, appointments, employees, onClose, onSubmit, onAddAppointment, onEditAppointment, canEditPermissions }: EmployeeFormProps) {"""
code = code.replace(sig_target, sig_replacement)

# 3. Update formData initialization
state_target = """const [formData, setFormData] = useState(initialData || { name: '', department: '', employmentStatus: 'active', profilePhoto: null, slackId: '', hireDate: '', baseSalary: 0, efficiencyScore: 0, sectorId: '' });"""
state_replacement = """const [formData, setFormData] = useState(initialData || { name: '', department: '', employmentStatus: 'active', profilePhoto: null, slackId: '', hireDate: '', baseSalary: 0, efficiencyScore: 0, sectorId: '', cnic: '', dob: '', gender: 'Male', address: '', emergencyContact: '', contactInfo: '', designation: '', reportingManagerId: '', employmentType: 'Full-time', confirmationDate: '', contractStartDate: '', contractEndDate: '', assignedOffice: '', bankDetails: '', taxInformation: '' });
  const [assets, setAssets] = useState<any[]>([]);
  const [unassignedAssets, setUnassignedAssets] = useState<any[]>([]);

  useEffect(() => {
    if (initialData?.id) {
      fetch(`${API}/hr/assets?assigned_to=${initialData.id}`, { headers: { Authorization: `Bearer ${token()}` } })
        .then(r => r.json()).then(d => setAssets(d.data || []));
      fetch(`${API}/hr/assets`, { headers: { Authorization: `Bearer ${token()}` } })
        .then(r => r.json()).then(d => setUnassignedAssets((d.data || []).filter((a: any) => !a.assignedTo)));
    }
  }, [initialData?.id]);

  const handleAssignAsset = async (assetId: string) => {
    try {
      await fetch(`${API}/hr/assets/${assetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ assignedTo: initialData.id, status: 'Assigned', issueDate: new Date().toISOString().split('T')[0] })
      });
      const assigned = unassignedAssets.find(a => a.id === assetId);
      if (assigned) {
        setAssets([...assets, { ...assigned, assignedTo: initialData.id, status: 'Assigned' }]);
        setUnassignedAssets(unassignedAssets.filter(a => a.id !== assetId));
      }
    } catch {}
  };

  const handleUnassignAsset = async (assetId: string) => {
    try {
      await fetch(`${API}/hr/assets/${assetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ assignedTo: null, status: 'Available' })
      });
      const unassigned = assets.find(a => a.id === assetId);
      if (unassigned) {
        setUnassignedAssets([...unassignedAssets, { ...unassigned, assignedTo: null, status: 'Available' }]);
        setAssets(assets.filter(a => a.id !== assetId));
      }
    } catch {}
  };
"""
code = code.replace(state_target, state_replacement)

# 4. Insert new form sections
form_section_target = """              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Email Address</label>
                  <input type="email" value={formData.email || ''} onChange={e => setFormData({ ...formData, email: e.target.value })} placeholder="email@gaos.org" className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Phone Number</label>
                  <input type="tel" value={formData.phone || ''} onChange={e => setFormData({ ...formData, phone: e.target.value })} placeholder="+1 (555) 000-0000" className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50" />
                </div>
              </div>"""
form_section_replacement = form_section_target + """
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">CNIC / ID</label>
                  <input type="text" value={formData.cnic || ''} onChange={e => setFormData({ ...formData, cnic: e.target.value })} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Date of Birth</label>
                  <input type="date" value={formData.dob || ''} onChange={e => setFormData({ ...formData, dob: e.target.value })} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Emergency Contact</label>
                  <input type="text" value={formData.emergencyContact || ''} onChange={e => setFormData({ ...formData, emergencyContact: e.target.value })} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Gender</label>
                  <select value={formData.gender || ''} onChange={e => setFormData({ ...formData, gender: e.target.value })} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50">
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5 mt-4">
                <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Full Address</label>
                <textarea rows={2} value={formData.address || ''} onChange={e => setFormData({ ...formData, address: e.target.value })} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50 resize-none" />
              </div>
"""
code = code.replace(form_section_target, form_section_replacement)

# 5. Insert Employment and Financial details
employment_target = """            <div className="grid grid-cols-4 gap-4 pt-4 border-t border-white/5">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Status</label>
                <select value={formData.employmentStatus} onChange={e => setFormData({ ...formData, employmentStatus: e.target.value })} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50">"""
employment_replacement = """
            <div className="space-y-4 pt-4 border-t border-white/5">
              <h3 className="text-sm font-black text-primary uppercase tracking-widest">Employment Details</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Designation</label>
                  <input type="text" value={formData.designation || ''} onChange={e => setFormData({ ...formData, designation: e.target.value })} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Employment Type</label>
                  <select value={formData.employmentType || ''} onChange={e => setFormData({ ...formData, employmentType: e.target.value })} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50">
                    <option value="Full-time">Full-time</option>
                    <option value="Part-time">Part-time</option>
                    <option value="Contract">Contract</option>
                    <option value="Intern">Intern</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Reporting Manager</label>
                  <select value={formData.reportingManagerId || ''} onChange={e => setFormData({ ...formData, reportingManagerId: e.target.value })} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50">
                    <option value="">None</option>
                    {employees?.map((emp: any) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Contract Start</label>
                  <input type="date" value={formData.contractStartDate || ''} onChange={e => setFormData({ ...formData, contractStartDate: e.target.value })} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Contract End</label>
                  <input type="date" value={formData.contractEndDate || ''} onChange={e => setFormData({ ...formData, contractEndDate: e.target.value })} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Assigned Office</label>
                  <input type="text" value={formData.assignedOffice || ''} onChange={e => setFormData({ ...formData, assignedOffice: e.target.value })} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50" />
                </div>
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-white/5">
              <h3 className="text-sm font-black text-primary uppercase tracking-widest">Financial & Compliance</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Bank Details (JSON string)</label>
                  <textarea rows={2} value={formData.bankDetails || ''} onChange={e => setFormData({ ...formData, bankDetails: e.target.value })} placeholder='{"bank": "...", "account": "..."}' className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50 resize-none font-mono" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Tax Information (NTN/STRN)</label>
                  <textarea rows={2} value={formData.taxInformation || ''} onChange={e => setFormData({ ...formData, taxInformation: e.target.value })} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50 resize-none font-mono" />
                </div>
              </div>
            </div>

            {initialData?.id && (
              <div className="space-y-4 pt-4 border-t border-white/5">
                <h3 className="text-sm font-black text-primary uppercase tracking-widest">Asset Assignment</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1 mb-2">Assigned Assets</label>
                    <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                      {assets.length === 0 ? <p className="text-xs text-textSecondary italic">No assets assigned.</p> : assets.map(a => (
                        <div key={a.id} className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/10">
                          <div>
                            <p className="text-xs font-bold">{a.assetName}</p>
                            <p className="text-[10px] text-textSecondary">{a.assetType}</p>
                          </div>
                          <button type="button" onClick={() => handleUnassignAsset(a.id)} className="text-[10px] text-red-400 font-bold px-2 py-1 bg-red-400/10 rounded hover:bg-red-400/20">Remove</button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1 mb-2">Available Assets</label>
                    <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                      {unassignedAssets.length === 0 ? <p className="text-xs text-textSecondary italic">No available assets.</p> : unassignedAssets.map(a => (
                        <div key={a.id} className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/10">
                          <div>
                            <p className="text-xs font-bold">{a.assetName}</p>
                            <p className="text-[10px] text-textSecondary">{a.assetType}</p>
                          </div>
                          <button type="button" onClick={() => handleAssignAsset(a.id)} className="text-[10px] text-primary font-bold px-2 py-1 bg-primary/10 rounded hover:bg-primary/20">Assign</button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-4 gap-4 pt-4 border-t border-white/5">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Status</label>
                <select value={formData.employmentStatus} onChange={e => setFormData({ ...formData, employmentStatus: e.target.value })} className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary/50">"""
code = code.replace(employment_target, employment_replacement)

with open('scratch/HR_EmployeeForm_new.txt', 'w') as f:
    f.write(code)
