import React, { useState, useEffect } from 'react';
import { Download, FileText, Users, Calendar, Banknote, Shield, X, Loader2 } from 'lucide-react';
import { token } from '../lib/auth';
import { errorMessage } from '../lib/errors';


interface HRReportsProps {
  employees: any[];
}

interface ReportConfig {
  id: string;
  name: string;
  desc: string;
  icon: any;
  endpoint: string;
  dateKey: string;
  empKey: string;
}

export default function HRReports(_props: HRReportsProps) {
  const reports: ReportConfig[] = [
    { id: 'emp_dir', name: 'Employee Directory', desc: 'Complete list of active and inactive employees.', icon: Users, endpoint: '/api/core/employees', dateKey: 'hireDate', empKey: 'id' },
    { id: 'att_rep', name: 'Attendance Report', desc: 'Detailed log of check-in, check-out, status, and total hours.', icon: Calendar, endpoint: '/api/hr/attendance', dateKey: 'date', empKey: 'employeeId' },
    { id: 'leave_rep', name: 'Leave Summary', desc: 'List of leave requests, status, and approved types.', icon: Calendar, endpoint: '/api/hr/leave-requests', dateKey: 'startDate', empKey: 'employeeId' },
    { id: 'pay_sum', name: 'Payroll Summary', desc: 'Earnings, deductions, bonuses, and net pay breakdown.', icon: Banknote, endpoint: '/api/hr/payroll', dateKey: 'payrollMonth', empKey: 'employeeId' },
    { id: 'tax_rep', name: 'Tax Report', desc: 'Withholding tax records per employee.', icon: FileText, endpoint: '/api/hr/payroll', dateKey: 'payrollMonth', empKey: 'employeeId' },
    { id: 'asset_reg', name: 'Asset Register', desc: 'List of all company assets assigned to employees.', icon: Shield, endpoint: '/api/hr/assets', dateKey: 'issueDate', empKey: 'assignedTo' },
  ];

  const [allEmployees, setAllEmployees] = useState<any[]>([]);
  const [selectedReport, setSelectedReport] = useState<ReportConfig | null>(null);
  const [employeeId, setEmployeeId] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchAllEmployees = async () => {
      try {
        const res = await fetch('/api/core/employees', {
          headers: { Authorization: `Bearer ${token()}` }
        });
        const d = await res.json();
        if (res.ok) {
          setAllEmployees(d.data || []);
        }
      } catch (err) {
        console.error('Error fetching employees for report resolution', err);
      }
    };
    fetchAllEmployees();
  }, []);

  const handleGenerateReport = async () => {
    if (!selectedReport) return;
    setError('');
    setLoading(true);

    try {
      // 1. Fetch data from endpoint
      let url = selectedReport.endpoint;
      if (employeeId !== 'ALL' && selectedReport.id !== 'emp_dir') {
        const separator = url.includes('?') ? '&' : '?';
        const paramName = selectedReport.empKey === 'assignedTo' ? 'assigned_to' : 'employee_id';
        url += `${separator}${paramName}=${employeeId}`;
      }

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token()}` }
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to fetch report data');

      const rawData = d.data || [];

      // 2. Perform Client-side Date Range and Employee Filtering
      const filteredData = rawData.filter((row: any) => {
        // Date range checks
        const rowDateStr = row[selectedReport.dateKey];
        if (rowDateStr) {
          // If the date field is YYYY-MM (e.g. payrollMonth)
          if (rowDateStr.length === 7) {
            const startMonth = startDate ? startDate.substring(0, 7) : '';
            const endMonth = endDate ? endDate.substring(0, 7) : '';
            if (startMonth && rowDateStr < startMonth) return false;
            if (endMonth && rowDateStr > endMonth) return false;
          } else {
            const rowDate = rowDateStr.substring(0, 10);
            if (startDate && rowDate < startDate) return false;
            if (endDate && rowDate > endDate) return false;
          }
        }
        // Additional employee check if employeeId !== 'ALL' (mainly for directory)
        if (selectedReport.id === 'emp_dir' && employeeId !== 'ALL') {
          if (row.id !== employeeId) return false;
        }
        return true;
      });
      let finalData = filteredData;

      if (selectedReport.id === 'att_rep' && startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const employeesToCheck = employeeId === 'ALL' 
          ? allEmployees.filter(e => e.employmentStatus === 'active')
          : allEmployees.filter(e => e.id === employeeId);
        
        const absentRows: any[] = [];
        
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const day = d.getDay();
          if (day === 0 || day === 6) continue; // Skip weekends
          
          const dateStr = d.toISOString().split('T')[0];
          
          for (const emp of employeesToCheck) {
            const hasRecord = filteredData.some((r: any) => r.employeeId === emp.id && r.date === dateStr);
            if (!hasRecord) {
              absentRows.push({
                id: `absent-${emp.id}-${dateStr}`,
                employeeId: emp.id,
                date: dateStr,
                checkIn: null,
                checkOut: null,
                status: 'Absent',
                totalHours: 0
              });
            }
          }
        }
        
        finalData = [...filteredData, ...absentRows].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      }

      // 3. Render and Print PDF
      openReportPrintWindow(selectedReport, finalData);
      setSelectedReport(null);
    } catch (err) {
      setError(errorMessage(err, 'Report generation failed'));
    } finally {
      setLoading(false);
    }
  };

  const getEmpName = (id: string) => {
    if (id === 'ALL') return 'All Employees';
    const emp = allEmployees.find(e => e.id === id);
    return emp ? emp.name : id;
  };

  const openReportPrintWindow = (report: ReportConfig, data: any[]) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    let tableHeaders = '';
    let tableRows = '';

    if (report.id === 'emp_dir') {
      tableHeaders = `
        <th>ID</th>
        <th>Name</th>
        <th>Department</th>
        <th>Designation</th>
        <th>Status</th>
        <th>Joining Date</th>
      `;
      tableRows = data.map(r => `
        <tr>
          <td>${r.id.substring(0, 8)}...</td>
          <td><strong>${r.name}</strong></td>
          <td>${r.department || '—'}</td>
          <td>${r.designation || '—'}</td>
          <td><span class="badge ${r.employmentStatus}">${r.employmentStatus}</span></td>
          <td>${r.hireDate || '—'}</td>
        </tr>
      `).join('');
    } else if (report.id === 'att_rep') {
      tableHeaders = `
        <th>Employee</th>
        <th>Date</th>
        <th>Check In</th>
        <th>Check Out</th>
        <th>Status</th>
        <th>Hours</th>
      `;
      tableRows = data.map(r => `
        <tr>
          <td><strong>${getEmpName(r.employeeId)}</strong></td>
          <td>${r.date}</td>
          <td>${r.checkIn || '—'}</td>
          <td>${r.checkOut || '—'}</td>
          <td><span class="badge ${r.status?.toLowerCase()}">${r.status || '—'}</span></td>
          <td class="mono">${r.totalHours ? r.totalHours.toFixed(1) : '0.0'}</td>
        </tr>
      `).join('');
    } else if (report.id === 'leave_rep') {
      tableHeaders = `
        <th>Employee</th>
        <th>Leave Type</th>
        <th>Start Date</th>
        <th>End Date</th>
        <th>Status</th>
      `;
      tableRows = data.map(r => `
        <tr>
          <td><strong>${getEmpName(r.employeeId)}</strong></td>
          <td>${r.leaveType}</td>
          <td>${r.startDate}</td>
          <td>${r.endDate}</td>
          <td><span class="badge ${r.status?.toLowerCase()}">${r.status}</span></td>
        </tr>
      `).join('');
    } else if (report.id === 'pay_sum') {
      tableHeaders = `
        <th>Employee</th>
        <th>Month</th>
        <th>Gross</th>
        <th>Withholding Tax</th>
        <th>Other Deductions</th>
        <th>Net Pay</th>
      `;
      tableRows = data.map(r => `
        <tr>
          <td><strong>${getEmpName(r.employeeId)}</strong></td>
          <td>${r.payrollMonth}</td>
          <td class="mono">$${r.grossSalary?.toLocaleString()}</td>
          <td class="mono text-red">$${r.withholdingTax?.toLocaleString()}</td>
          <td class="mono text-red">$${r.otherDeductions?.toLocaleString()}</td>
          <td class="mono font-bold">$${r.netPay?.toLocaleString()}</td>
        </tr>
      `).join('');
    } else if (report.id === 'tax_rep') {
      tableHeaders = `
        <th>Employee</th>
        <th>Month</th>
        <th>Gross Salary</th>
        <th>Withholding Tax</th>
      `;
      tableRows = data.map(r => `
        <tr>
          <td><strong>${getEmpName(r.employeeId)}</strong></td>
          <td>${r.payrollMonth}</td>
          <td class="mono">$${r.grossSalary?.toLocaleString()}</td>
          <td class="mono font-bold text-red">$${r.withholdingTax?.toLocaleString()}</td>
        </tr>
      `).join('');
    } else if (report.id === 'asset_reg') {
      tableHeaders = `
        <th>Asset Name</th>
        <th>Type</th>
        <th>Assigned To</th>
        <th>Condition</th>
        <th>Status</th>
      `;
      tableRows = data.map(r => `
        <tr>
          <td><strong>${r.assetName}</strong></td>
          <td>${r.assetType}</td>
          <td>${getEmpName(r.assignedTo)}</td>
          <td>${r.condition || '—'}</td>
          <td><span class="badge ${r.status?.toLowerCase()}">${r.status}</span></td>
        </tr>
      `).join('');
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>${report.name} — Godwin Austen Labs</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: -apple-system, system-ui, sans-serif; padding: 40px; color: #111; background: #fff; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 20px; margin-bottom: 24px; }
            .company { font-size: 22px; font-weight: 900; letter-spacing: -0.5px; }
            .title { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #555; margin-top: 4px; }
            .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px; background: #f9f9f9; padding: 15px; border-radius: 8px; border: 1px solid #eee; }
            .meta-label { font-size: 8px; font-weight: 800; text-transform: uppercase; color: #888; letter-spacing: 1px; }
            .meta-val { font-size: 12px; font-weight: 700; margin-top: 3px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { text-align: left; background: #111; color: #fff; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; padding: 10px 12px; }
            td { font-size: 12px; padding: 10px 12px; border-bottom: 1px solid #eee; }
            .mono { font-family: monospace; font-size: 12px; }
            .font-bold { font-weight: 700; }
            .text-red { color: #dc2626; }
            .badge { display: inline-block; padding: 3px 8px; border-radius: 9999px; font-size: 9px; font-weight: 700; text-transform: uppercase; }
            .badge.active, .badge.present, .badge.approved { background: #dcfce7; color: #15803d; }
            .badge.pending, .badge.late { background: #fef9c3; color: #a16207; }
            .badge.inactive, .badge.absent, .badge.rejected { background: #fee2e2; color: #b91c1c; }
            .footer { margin-top: 50px; font-size: 10px; color: #888; border-top: 1px solid #eee; padding-top: 15px; text-align: right; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <p class="company">Godwin Austen Labs</p>
              <p class="title">${report.name}</p>
            </div>
            <div style="text-align: right;">
              <p style="font-size: 11px; font-weight: 600;">Report Type: PDF Document</p>
              <p style="font-size: 10px; color: #666; margin-top: 4px;">Generated: ${new Date().toLocaleDateString()}</p>
            </div>
          </div>
          
          <div class="meta">
            <div>
              <p class="meta-label">Selected Employee</p>
              <p class="meta-val">${getEmpName(employeeId)}</p>
            </div>
            <div>
              <p class="meta-label">Period Start</p>
              <p class="meta-val">${startDate}</p>
            </div>
            <div>
              <p class="meta-label">Period End</p>
              <p class="meta-val">${endDate}</p>
            </div>
          </div>

          <table>
            <thead>
              <tr>${tableHeaders}</tr>
            </thead>
            <tbody>
              ${data.length === 0 ? `<tr><td colspan="10" style="text-align: center; color: #888; padding: 30px;">No records match the specified filters.</td></tr>` : tableRows}
            </tbody>
          </table>

          <div class="footer">
            <p>This is a system-generated corporate report · GAnovaOS Human Resources Platform</p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  return (
    <div className="space-y-6 animate-in fade-in zoom-in duration-300">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">HR Reports</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {reports.map(report => (
          <div key={report.id} className="glass-panel p-6 rounded-3xl border border-white/10 hover:border-primary/50 transition-all group flex flex-col h-full">
            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <report.icon className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-lg font-bold mb-2">{report.name}</h3>
            <p className="text-sm text-textSecondary flex-1 mb-6">{report.desc}</p>
            
            <button
              onClick={() => setSelectedReport(report)}
              className="w-full py-2.5 rounded-xl bg-primary text-white text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
            >
              <FileText className="w-4 h-4" /> Configure & Export
            </button>
          </div>
        ))}
      </div>

      {/* PARAMETERS WIZARD MODAL */}
      {selectedReport && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-md p-4" onClick={() => setSelectedReport(null)}>
          <div className="glass-panel rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar shadow-2xl border border-white/20 animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/5">
              <div>
                <h3 className="text-lg font-bold">Report Parameters</h3>
                <p className="text-xs text-textSecondary mt-0.5">{selectedReport.name}</p>
              </div>
              <button onClick={() => setSelectedReport(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors text-textSecondary">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Inputs */}
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Employee Scope</label>
                <select
                  value={employeeId}
                  onChange={e => setEmployeeId(e.target.value)}
                  className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50"
                >
                  <option value="ALL">All Employees (Entire Directory)</option>
                  {allEmployees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name}{emp.employmentStatus === 'inactive' ? ' (Inactive)' : ''}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-textSecondary uppercase tracking-widest ml-1">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="w-full bg-surface/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50"
                  />
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold rounded-xl">
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-white/10 bg-black/20 flex gap-3">
              <button
                onClick={() => setSelectedReport(null)}
                className="flex-1 py-3 rounded-xl border border-white/10 text-sm font-bold text-textSecondary hover:bg-white/5 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateReport}
                disabled={loading}
                className="flex-1 py-3 rounded-xl bg-primary text-white text-sm font-bold hover:opacity-90 transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Querying...</>
                ) : (
                  <><Download className="w-4 h-4" /> Generate PDF</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
