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
