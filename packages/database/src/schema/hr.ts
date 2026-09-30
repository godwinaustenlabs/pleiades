import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { employees, committees } from './core';
import { accounts } from './finance';

export const sectors = sqliteTable('sectors', {
  id: text('sector_id').primaryKey(),
  sectorName: text('sector_name').notNull(),
  sectorType: text('sector_type'),
  budgetAmount: real('budget_amount'),
  headEmployeeId: text('head_employee_id').references(() => employees.id),
  sectorPhoto: text('sector_photo'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

/**
 * A post, and the unit access is defined on.
 *
 * `employee_id` is whoever holds it right now, and it is the only link to a
 * person here. There used to be an `account_id` naming a login created for this
 * one posting, which is what made logins per-appointment: somebody holding two
 * posts held two logins and could read only one of them at a time. Migration
 * 0047 removed that column. The person's login is found through
 * `users_logins.employee_id` instead, of which there is exactly one per employee.
 *
 * An appointment with a NULL `employee_id` is vacant. That is a useful state
 * rather than a broken one: its grants and its mailbox keep existing, reach
 * nobody, and are conferred whole on whoever is appointed next.
 */
export const appointments = sqliteTable('appointments', {
  id: text('appointment_id').primaryKey(),
  roleOrTitle: text('role_or_title'),
  appointmentDate: text('appointment_date'),
  termType: text('term_type'),
  appointmentEndDate: text('appointment_end_date'),
  /**
   * The one switch on whether this appointment's grants apply. Deliberately not
   * `appointment_end_date`: access that lapses on a date nobody re-reads is
   * access that lapses at a moment no test can pin, and an ended appointment
   * that still grants is a data-hygiene problem with a visible fix.
   */
  isActive: integer('is_active', { mode: 'boolean' }),
  employeeId: text('employee_id').references(() => employees.id),
  committeeId: text('committee_id').references(() => committees.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

/**
 * appointment_app_permissions
 *
 * What an appointment can reach. Same shape as `user_app_permissions` on purpose
 * — the two are unioned per (appName, feature) by OR-ing the flags in
 * src/middleware/rbac.ts, and a resolver that had to translate between two
 * shapes would eventually translate one of them wrongly.
 *
 * This is the half of authorization that survives a handover. Replacing a
 * project manager is one edit to `appointments.employee_id`; the new holder
 * gains every grant here and the old one loses them, with no permission matrix
 * touched for either person.
 *
 * (appointment_id, app_name, feature) is unique, so saving an appointment's
 * access is a delete-then-insert of its whole set rather than a per-row merge.
 */
export const appointmentAppPermissions = sqliteTable('appointment_app_permissions', {
  id: text('id').primaryKey(),
  appointmentId: text('appointment_id').notNull().references(() => appointments.id),
  appName: text('app_name').notNull(),
  feature: text('feature').notNull(),
  canView: integer('can_view', { mode: 'boolean' }).default(false),
  canEdit: integer('can_edit', { mode: 'boolean' }).default(false),
  canDelete: integer('can_delete', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
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

/**
 * The asset register.
 *
 * Custody (who holds it) and value (what it is worth) in one table, because
 * they describe the same object. HR assigns; Accounting depreciates. The
 * monetary columns are all nullable: a keyboard needs no useful life, and the
 * register is still worth keeping before the chart of accounts exists.
 */
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

  // ── What it is worth ──────────────────────────────────────────────────────
  purchaseCost: real('purchase_cost'),
  purchaseDate: text('purchase_date'), // YYYY-MM-DD
  salvageValue: real('salvage_value').default(0),
  usefulLifeMonths: integer('useful_life_months'),
  /** laptop | furniture | building | vehicle | equipment | stationery | other */
  assetClass: text('asset_class').default('other'),
  serialNumber: text('serial_number'),
  vendor: text('vendor'),
  depreciationMethod: text('depreciation_method').default('straight_line'),
  accumulatedDepreciation: real('accumulated_depreciation').default(0),
  /** YYYY-MM of the last period posted, so a re-run cannot charge it twice. */
  lastDepreciationPeriod: text('last_depreciation_period'),
  disposedAt: text('disposed_at'), // YYYY-MM-DD
  disposalProceeds: real('disposal_proceeds'),
  notes: text('notes'),

  // ── Where it sits in the books ────────────────────────────────────────────
  assetAccountId: text('asset_account_id').references(() => accounts.id),
  depreciationExpenseAccountId: text('depreciation_expense_account_id').references(() => accounts.id),
  accumulatedDepreciationAccountId: text('accumulated_depreciation_account_id').references(() => accounts.id),

  updatedAt: integer('updated_at', { mode: 'timestamp' }),
});

export const performanceReviews = sqliteTable('performance_reviews', {
  id: text('id').primaryKey(),
  /** The REVIEWEE. This row is their record, which is why it survives the reviewer leaving. */
  employeeId: text('employee_id').notNull().references(() => employees.id),
  reviewPeriod: text('review_period').notNull(), // Q1 2026
  /**
   * Nullable since migration 0048, like every other "who did this" column. A review
   * is the reviewee's history; the person who wrote it leaving the company clears
   * the name on it and nothing else.
   */
  reviewerId: text('reviewer_id').references(() => employees.id),
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
