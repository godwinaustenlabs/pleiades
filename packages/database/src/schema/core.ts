import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const employees = sqliteTable('employees', {
  id: text('employee_id').primaryKey(),
  name: text('name').notNull(),
  slackId: text('slack_id').unique(),

  department: text('department'),
  role: text('role'),
  email: text('email'),
  phone: text('phone'),
  employmentStatus: text('employment_status'), // active | inactive | on_leave
  hireDate: text('hire_date'),
  baseSalary: real('base_salary'),
  efficiencyScore: real('efficiency_score'),
  profilePhoto: text('profile_photo'),
  sectorId: text('sector_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const labs = sqliteTable('labs', {
  id: text('lab_id').primaryKey(),
  labName: text('lab_name').notNull(),
  category: text('category'),
  description: text('description'),
  status: text('status'), // active | paused | blocked | closed
  opsLeadId: text('ops_lead_id').references(() => employees.id),
  labPhoto: text('lab_photo'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const employeeLab = sqliteTable('employee_lab', {
  employeeId: text('employee_id').notNull().references(() => employees.id),
  labId: text('lab_id').notNull().references(() => labs.id),
  joinedAt: text('joined_at'),
});

export const clients = sqliteTable('clients', {
  id: text('client_id').primaryKey(),
  clientName: text('client_name').notNull(),
  primaryContact: text('primary_contact'),
  contactEmail: text('contact_email'),
  phone: text('phone'),
  industry: text('industry'),
  address: text('address'),
  onboardingDate: text('onboarding_date'),
  contractStatus: text('contract_status'),
  slaStatus: text('sla_status'),
  clientPhoto: text('client_photo'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const committees = sqliteTable('committees', {
  id: text('committee_id').primaryKey(),
  committeeName: text('committee_name').notNull(),
  type: text('type'),
  opsStatus: text('ops_status'),
  purpose: text('purpose'),
  dateFormed: text('date_formed'),
  activeStatus: integer('active_status', { mode: 'boolean' }),
  labId: text('lab_id').references(() => labs.id),
  clientId: text('client_id').references(() => clients.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const committeeMembers = sqliteTable('committee_members', {
  committeeId: text('committee_id').notNull().references(() => committees.id),
  employeeId: text('employee_id').notNull().references(() => employees.id),
  roleInCommittee: text('role_in_committee'),
  joinedAt: text('joined_at'),
});

export const monthlyReports = sqliteTable('monthly_reports', {
  id: text('report_id').primaryKey(),
  reportName: text('report_name').notNull(),
  reportMonth: text('report_month'),
  committeeId: text('committee_id').references(() => committees.id),
  financeClearance: integer('finance_clearance', { mode: 'boolean' }),
  hrClearance: integer('hr_clearance', { mode: 'boolean' }),
  legalClearance: integer('legal_clearance', { mode: 'boolean' }),
  opsClearance: integer('ops_clearance', { mode: 'boolean' }),
  opsFinalApproval: integer('ops_final_approval', { mode: 'boolean' }),
  financeNotes: text('finance_notes'),
  hrNotes: text('hr_notes'),
  legalNotes: text('legal_notes'),
  opsNotes: text('ops_notes'),
  reportDoc: text('report_doc'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const coreDocs = sqliteTable('core_docs', {
  id: text('doc_id').primaryKey(),
  docTitle: text('doc_title').notNull(),
  docType: text('doc_type'),
  description: text('description'),
  uploadDate: text('upload_date'),
  attachment: text('attachment'),
  confidential: integer('confidential', { mode: 'boolean' }),
  tags: text('tags'), // stored as comma-separated string or JSON
  committeeId: text('committee_id').references(() => committees.id),
  clientId: text('client_id').references(() => clients.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
