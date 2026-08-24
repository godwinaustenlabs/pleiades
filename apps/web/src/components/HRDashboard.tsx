import React from 'react';
import { Users, Calendar, Activity, CheckCircle2, Clock, AlertTriangle, FileText, Briefcase } from 'lucide-react';

interface HRDashboardProps {
  employees: any[];
  attendance: any[];
  leaves: any[];
  payroll: any[];
  assets: any[];
}

export default function HRDashboard({ employees, attendance, leaves }: HRDashboardProps) {
  const activeEmployees = employees.filter(e => e.employmentStatus === 'active');
  
  const today = new Date().toISOString().split('T')[0];
  const presentToday = attendance.filter(a => a.date === today && a.status === 'Present').length;
  const onLeaveToday = leaves.filter(l => l.status === 'Approved' && l.startDate <= today && l.endDate >= today).length;
  const absentToday = activeEmployees.length - presentToday - onLeaveToday;

  const pendingLeaves = leaves.filter(l => l.status === 'Pending').length;
  
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel p-6 rounded-3xl border border-white/10 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
            <Users className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-textSecondary font-bold">Total Employees</p>
            <p className="text-2xl font-black">{activeEmployees.length}</p>
          </div>
        </div>

        <div className="glass-panel p-6 rounded-3xl border border-white/10 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6 text-green-400" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-textSecondary font-bold">Present Today</p>
            <p className="text-2xl font-black">{presentToday}</p>
          </div>
        </div>

        <div className="glass-panel p-6 rounded-3xl border border-white/10 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-yellow-500/20 flex items-center justify-center">
            <Clock className="w-6 h-6 text-yellow-400" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-textSecondary font-bold">Pending Leaves</p>
            <p className="text-2xl font-black">{pendingLeaves}</p>
          </div>
        </div>

        <div className="glass-panel p-6 rounded-3xl border border-white/10 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-red-400" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-textSecondary font-bold">Absent Today</p>
            <p className="text-2xl font-black">{absentToday}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel p-6 rounded-3xl border border-white/10">
          <h3 className="text-sm font-black uppercase tracking-widest text-primary mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4" /> Quick Actions
          </h3>
          <div className="grid grid-cols-2 gap-4">
             <button className="p-4 rounded-xl bg-white/5 border border-white/10 hover:border-primary/50 transition-all text-left">
               <FileText className="w-5 h-5 mb-2 text-primary" />
               <p className="font-bold text-sm">Run Monthly Payroll</p>
               <p className="text-xs text-textSecondary mt-1">Process salaries and generate slips.</p>
             </button>
             <button className="p-4 rounded-xl bg-white/5 border border-white/10 hover:border-primary/50 transition-all text-left">
               <Briefcase className="w-5 h-5 mb-2 text-primary" />
               <p className="font-bold text-sm">View Reports</p>
               <p className="text-xs text-textSecondary mt-1">Export HR and Finance data.</p>
             </button>
          </div>
        </div>
        
        <div className="glass-panel p-6 rounded-3xl border border-white/10">
          <h3 className="text-sm font-black uppercase tracking-widest text-primary mb-4 flex items-center gap-2">
            <Calendar className="w-4 h-4" /> Upcoming Events
          </h3>
          <div className="space-y-4">
            <div className="text-sm text-textSecondary italic">No upcoming events this week.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
