/**
 * scratch/seed_mock_data.ts
 *
 * Populates the local database with rich dummy data,
 * strictly following the ACTUAL local schema.
 */

import crypto from 'crypto';

const now = Math.floor(Date.now() / 1000);
const lines: string[] = ['PRAGMA foreign_keys = OFF;'];

// 1. Mock Employees (Matching local schema: employee_id, name, department, role, employment_status, hire_date, efficiency_score, created_at, updated_at)
const DEPARTMENTS = ['HR', 'Finance', 'Legal', 'Ops', 'Acquisition', 'Tech'];
const employeeIds: string[] = [];

for (let i = 1; i <= 15; i++) {
  const id = `emp-${i.toString().padStart(3, '0')}`;
  const dept = DEPARTMENTS[i % DEPARTMENTS.length];
  employeeIds.push(id);
  lines.push(
    `INSERT OR IGNORE INTO employees (employee_id, name, department, role, employment_status, hire_date, efficiency_score, created_at, updated_at) ` +
    `VALUES ('${id}', 'Employee ${i}', '${dept}', 'Staff', 'active', '2025-01-01', 0.85, ${now}, ${now});`
  );
}

// 2. Mock Labs
const labIds: string[] = [];
for (let i = 1; i <= 3; i++) {
  const id = `lab-${i}`;
  labIds.push(id);
  lines.push(
    `INSERT OR IGNORE INTO labs (lab_id, lab_name, category, status, ops_lead_id, created_at, updated_at) ` +
    `VALUES ('${id}', 'Innovation Lab ${i}', 'Tech', 'active', 'emp-001', ${now}, ${now});`
  );
}

// 3. Mock Clients & Committees
const clientIds: string[] = [];
const committeeIds: string[] = [];
for (let i = 1; i <= 5; i++) {
  const cid = `client-${i}`;
  clientIds.push(cid);
  lines.push(
    `INSERT OR IGNORE INTO clients (client_id, client_name, industry, contract_status, created_at, updated_at) ` +
    `VALUES ('${cid}', 'Mock Corp ${i}', 'Technology', 'active', ${now}, ${now});`
  );

  const comId = `com-${i}`;
  committeeIds.push(comId);
  lines.push(
    `INSERT OR IGNORE INTO committees (committee_id, committee_name, type, ops_status, lab_id, client_id, active_status, created_at, updated_at) ` +
    `VALUES ('${comId}', 'Committee ${i}', 'Project', 'operational', 'lab-1', '${cid}', 1, ${now}, ${now});`
  );
}

// 4. Mock Tasks (Matching local schema: task_id, title, description, status, priority, department, assignee_id, creator_id)
const STATUSES = ['todo', 'in_progress', 'completed', 'blocked'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const CEO_USER_ID = 'user-ceo-001';

for (let i = 1; i <= 30; i++) {
  const taskId = `task-${i.toString().padStart(3, '0')}`;
  const status = STATUSES[i % STATUSES.length];
  const priority = PRIORITIES[i % PRIORITIES.length];
  const dept = DEPARTMENTS[i % DEPARTMENTS.length];
  const assigneeId = employeeIds[i % employeeIds.length];

  lines.push(
    `INSERT OR IGNORE INTO universal_tasks (task_id, title, description, status, priority, department, assignee_id, creator_id) ` +
    `VALUES ('${taskId}', 'Mock Task ${i}', 'Detailed description for task ${i}', '${status}', '${priority}', '${dept}', '${assigneeId}', '${CEO_USER_ID}');`
  );
}

// 5. Mock Attendance
for (let i = 0; i < employeeIds.length; i++) {
  const empId = employeeIds[i];
  // 5 days of attendance for each employee
  for (let day = 10; day <= 14; day++) {
    const dateStr = `2026-07-${day.toString().padStart(2, '0')}`;
    const id = `att-${empId}-${day}`;
    lines.push(
      `INSERT OR IGNORE INTO attendance (id, employee_id, date, check_in, check_out, status, total_hours, created_at) ` +
      `VALUES ('${id}', '${empId}', '${dateStr}', '09:00', '17:00', 'Present', 8.0, ${now});`
    );
  }
}

// 6. Mock Leave Requests
for (let i = 0; i < employeeIds.length; i += 3) {
  const empId = employeeIds[i];
  const id = `leave-${empId}`;
  lines.push(
    `INSERT OR IGNORE INTO leave_requests (id, employee_id, leave_type, start_date, end_date, status, approved_by, reason, created_at) ` +
    `VALUES ('${id}', '${empId}', 'Annual', '2026-07-01', '2026-07-05', 'Approved', 'emp-001', 'Summer Vacation', ${now});`
  );
}

// 7. Mock Payroll Records
for (let i = 0; i < employeeIds.length; i++) {
  const empId = employeeIds[i];
  const id = `pay-${empId}-06`;
  lines.push(
    `INSERT OR IGNORE INTO payroll_records (payroll_id, payroll_month, gross_salary, withholding_tax, other_deductions, bonuses, net_pay, raise_amount, disbursement_status, payment_date, finance_reference, employee_id, allowances_breakdown, deductions_breakdown, created_at) ` +
    `VALUES ('${id}', '2026-06', 5000.0, 500.0, 100.0, 200.0, 4600.0, 0.0, 'paid', '2026-06-30', 'TXN-REF-${empId}', '${empId}', '[]', '[]', ${now});`
  );
}

// 8. Mock Assets
const ASSET_TYPES = ['Laptop', 'Monitor', 'Keyboard', 'Mouse'];
for (let i = 0; i < employeeIds.length; i++) {
  const empId = employeeIds[i];
  const id = `asset-${empId}`;
  const assetType = ASSET_TYPES[i % ASSET_TYPES.length];
  lines.push(
    `INSERT OR IGNORE INTO assets (id, asset_name, asset_type, assigned_to, issue_date, return_date, condition, status, created_at) ` +
    `VALUES ('${id}', 'Corporate ${assetType} ${i}', '${assetType}', '${empId}', '2026-01-15', NULL, 'Good', 'Assigned', ${now});`
  );
}

lines.push('PRAGMA foreign_keys = ON;', '-- ✅ Mock data population complete.');

console.log(lines.join('\n'));

