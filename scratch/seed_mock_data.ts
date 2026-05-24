/**
 * scratch/seed_mock_data.ts
 *
 * Populates the local database with rich dummy data,
 * strictly following the ACTUAL local schema.
 */

import crypto from 'crypto';

const now = Math.floor(Date.now() / 1000);
const lines: string[] = ['PRAGMA foreign_keys = OFF;', 'BEGIN TRANSACTION;'];

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

lines.push('COMMIT;', 'PRAGMA foreign_keys = ON;', '-- ✅ Mock data population complete.');

console.log(lines.join('\n'));
