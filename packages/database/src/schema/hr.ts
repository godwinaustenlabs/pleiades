import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { employees, committees } from './core';
import { usersLogins } from './auth';

export const sectors = sqliteTable('sectors', {
  id: text('sector_id').primaryKey(),
  sectorName: text('sector_name').notNull(),
  sectorType: text('sector_type'),
  budgetAmount: real('budget_amount'),
  headEmployeeId: text('head_employee_id').references(() => employees.id),
  sectorPhoto: text('sector_photo'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const appointments = sqliteTable('appointments', {
  id: text('appointment_id').primaryKey(),
  roleOrTitle: text('role_or_title'),
  appointmentDate: text('appointment_date'),
  termType: text('term_type'),
  appointmentEndDate: text('appointment_end_date'),
  isActive: integer('is_active', { mode: 'boolean' }),
  employeeId: text('employee_id').references(() => employees.id),
  accountId: text('account_id').references(() => usersLogins.id),
  committeeId: text('committee_id').references(() => committees.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// -- NEW HRMS TABLES --

export const attendance = sqliteTable('attendance', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id').notNull().references(() => employees.id),
  date: text('date').notNull(), // YYYY-MM-DD
  checkIn: text('check_in'), // ISO string or time
  checkOut: text('check_out'),
  status: text('status'), // Present, Absent, Late, Overtime, Remote
  totalHours: real('total_hours'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const leaveRequests = sqliteTable('leave_requests', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id').notNull().references(() => employees.id),
  leaveType: text('leave_type').notNull(), // Annual, Sick, Casual, Unpaid
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  status: text('status').notNull().default('Pending'), // Pending, Approved, Rejected
  approvedBy: text('approved_by').references(() => employees.id),
  reason: text('reason'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const leaveBalances = sqliteTable('leave_balances', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id').notNull().references(() => employees.id),
  leaveType: text('leave_type').notNull(),
  totalAccrued: real('total_accrued').default(0),
  totalUsed: real('total_used').default(0),
  year: integer('year').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const employeeDocuments = sqliteTable('employee_documents', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id').notNull().references(() => employees.id),
  documentType: text('document_type').notNull(), // Resume, Offer, CNIC
  url: text('url').notNull(),
  uploadDate: text('upload_date').notNull(),
  expiryDate: text('expiry_date'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

/**
 * company_documents
 * Shared document store, scoped by `department` so each module gets its own
 * docs tab off one table (hr = SOPs/policies, finance = statements/filings, …).
 * Files live in R2 via /api/assets; `url` is the download path.
 */
export const companyDocuments = sqliteTable('company_documents', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  documentType: text('document_type').notNull(), // SOP, Policy, Manual, Other
  url: text('url').notNull(),
  // Owning module: 'hr' | 'finance' | … Matches the RBAC app name, so the
  // docs feature is gated as <department>/docs.
  department: text('department').notNull().default('hr'),
  uploadedBy: text('uploaded_by').references(() => employees.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const salaryStructures = sqliteTable('salary_structures', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id').notNull().references(() => employees.id),
  baseSalary: real('base_salary').notNull(),
  effectiveDate: text('effective_date').notNull(),
  active: integer('active', { mode: 'boolean' }).default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const salaryComponents = sqliteTable('salary_components', {
  id: text('id').primaryKey(),
  structureId: text('structure_id').notNull().references(() => salaryStructures.id),
  componentName: text('component_name').notNull(), // e.g., HRA, Medical, Tax
  componentType: text('component_type').notNull(), // Earning, Deduction
  amountType: text('amount_type').notNull(), // Fixed, Percentage
  value: real('value').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const salaryRevisions = sqliteTable('salary_revisions', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id').notNull().references(() => employees.id),
  previousSalary: real('previous_salary').notNull(),
  newSalary: real('new_salary').notNull(),
  effectiveDate: text('effective_date').notNull(),
  reason: text('reason'),
  approvedBy: text('approved_by').references(() => employees.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const loans = sqliteTable('loans', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id').notNull().references(() => employees.id),
  originalAmount: real('original_amount').notNull(),
  remainingBalance: real('remaining_balance').notNull(),
  monthlyInstallment: real('monthly_installment').notNull(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date'),
  status: text('status').notNull().default('Active'), // Active, Paid
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const assets = sqliteTable('assets', {
  id: text('id').primaryKey(),
  assetName: text('asset_name').notNull(),
  assetType: text('asset_type').notNull(), // Laptop, Monitor
  assignedTo: text('assigned_to').references(() => employees.id),
  issueDate: text('issue_date'),
  returnDate: text('return_date'),
  condition: text('condition'),
  status: text('status').notNull().default('Available'), // Available, Assigned, Damaged
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const performanceReviews = sqliteTable('performance_reviews', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id').notNull().references(() => employees.id),
  reviewPeriod: text('review_period').notNull(), // Q1 2026
  reviewerId: text('reviewer_id').notNull().references(() => employees.id),
  score: real('score'),
  feedback: text('feedback'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// -- EXISTING HR TABLES (Modified) --

export const payrollRecords = sqliteTable('payroll_records', {
  id: text('payroll_id').primaryKey(),
  payrollMonth: text('payroll_month'),
  grossSalary: real('gross_salary'),
  withholdingTax: real('withholding_tax'),
  otherDeductions: real('other_deductions'),
  bonuses: real('bonuses'),
  netPay: real('net_pay'),
  raiseAmount: real('raise_amount'),
  disbursementStatus: text('disbursement_status'), // pending | processed | paid
  paymentDate: text('payment_date'),
  financeReference: text('finance_reference'), // Reference ID to transactions
  employeeId: text('employee_id').references(() => employees.id),
  // New JSON fields to make the payroll run perfectly auditable
  allowancesBreakdown: text('allowances_breakdown'), // JSON
  deductionsBreakdown: text('deductions_breakdown'), // JSON
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const legalTracker = sqliteTable('legal_tracker', {
  id: text('tracker_id').primaryKey(),
  contractType: text('contract_type'),
  legalStatus: text('legal_status'),
  contractDate: text('contract_date'),
  expiryDate: text('expiry_date'),
  contractAgeDays: integer('contract_age_days'),
  isOverdue: integer('is_overdue', { mode: 'boolean' }),
  contractPhoto: text('contract_photo'),
  employeeId: text('employee_id').references(() => employees.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
