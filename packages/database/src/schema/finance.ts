import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { clients, committees } from './core';

export const ledgers = sqliteTable('ledgers', {
  id: text('ledger_id').primaryKey(),
  ledgerName: text('ledger_name').notNull(),
  description: text('description'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const accounts = sqliteTable('accounts', {
  id: text('account_id').primaryKey(),
  ledgerId: text('ledger_id').references(() => ledgers.id),
  accountName: text('account_name').notNull(),
  accountType: text('account_type'),
  bankName: text('bank_name'),
  accountNumber: text('account_number'),
  openingBalance: real('opening_balance'),
  currentBalance: real('current_balance'),
  currency: text('currency'),
  status: text('status'), // active | inactive | closed
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const fundRequests = sqliteTable('fund_requests', {
  id: text('fund_request_id').primaryKey(),
  requestName: text('request_name').notNull(),
  requestDate: text('request_date'),
  amountRequested: real('amount_requested'),
  purpose: text('purpose'),
  approvalStatus: text('approval_status'),
  approvedBy: text('approved_by'),
  approvalDate: text('approval_date'),
  disbursementStatus: text('disbursement_status'),
  disbursementDate: text('disbursement_date'),
  committeeId: text('committee_id').references(() => committees.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const invoices = sqliteTable('invoices', {
  id: text('invoice_id').primaryKey(),
  invoiceNumber: text('invoice_number').notNull().unique(),
  issueDate: text('issue_date'),
  dueDate: text('due_date'),
  amount: real('amount'),
  status: text('status'),
  type: text('type'),
  vendorName: text('vendor_name'),
  description: text('description'),
  clientId: text('client_id').references(() => clients.id),
  committeeId: text('committee_id').references(() => committees.id),
  fundRequestId: text('fund_request_id').references(() => fundRequests.id),
  invoiceDoc: text('invoice_doc'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const transactions = sqliteTable('transactions', {
  id: text('transaction_id').primaryKey(),
  name: text('name').notNull(),
  transactionDate: text('transaction_date'),
  amount: real('amount'),
  transactionType: text('transaction_type'),
  description: text('description'),
  approved: integer('approved', { mode: 'boolean' }),
  createdBy: text('created_by'),
  committeeId: text('committee_id').references(() => committees.id),
  clientId: text('client_id').references(() => clients.id),
  accountId: text('account_id').references(() => accounts.id),
  invoiceId: text('invoice_id').references(() => invoices.id),
  fundRequestId: text('fund_request_id').references(() => fundRequests.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const plReports = sqliteTable('pl_reports', {
  id: text('report_id').primaryKey(),
  reportNo: text('report_no').notNull().unique(),
  period: text('period'),
  periodStart: text('period_start'),
  periodEnd: text('period_end'),
  totalIncome: real('total_income'),
  totalExpenses: real('total_expenses'),
  totalSalary: real('total_salary'),
  otherCapitalInputs: real('other_capital_inputs'),
  drawings: real('drawings'),
  tax: real('tax'),
  grossProfit: real('gross_profit'),
  netProfit: real('net_profit'),
  plNotes: text('pl_notes'),
  pdfAttachment: text('pdf_attachment'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
export const generalJournals = sqliteTable('general_journals', {
  id: text('journal_id').primaryKey(),
  entryDate: text('entry_date'),
  description: text('description'),
  debitAccountId: text('debit_account_id').references(() => accounts.id),
  creditAccountId: text('credit_account_id').references(() => accounts.id),
  amount: real('amount'),
  lines: text('lines'),
  ledgerId: text('ledger_id').references(() => ledgers.id),
  invoiceId: text('invoice_id').references(() => invoices.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
