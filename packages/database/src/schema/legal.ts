import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { committees, clients } from './core';

export const legalTemplates = sqliteTable('legal_templates', {
  id: text('template_id').primaryKey(),
  documentName: text('document_name').notNull(),
  versionNumber: text('version_number'),
  jurisdiction: text('jurisdiction'),
  lastUpdated: text('last_updated'),
  approvedBy: text('approved_by'),
  templateFile: text('template_file'),
  isLatest: integer('is_latest', { mode: 'boolean' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const partiesStakeholders = sqliteTable('parties_stakeholders', {
  id: text('party_id').primaryKey(),
  entityName: text('entity_name').notNull(),
  type: text('type'),
  contactInformation: text('contact_information'),
  riskStatus: text('risk_status'),
  jurisdiction: text('jurisdiction'),
  partyPhoto: text('party_photo'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const activeAgreements = sqliteTable('active_agreements', {
  id: text('agreement_id').primaryKey(),
  agreementName: text('agreement_name').notNull(),
  contractType: text('contract_type'),
  effectiveDate: text('effective_date'),
  expiryDate: text('expiry_date'),
  autoRenewal: integer('auto_renewal', { mode: 'boolean' }),
  paymentTerms: text('payment_terms'),
  status: text('status'),
  signedDoc: text('signed_doc'),
  committeeId: text('committee_id').references(() => committees.id),
  templateId: text('template_id').references(() => legalTemplates.id),
  clientId: text('client_id').references(() => clients.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const agreementParties = sqliteTable('agreement_parties', {
  agreementId: text('agreement_id').notNull().references(() => activeAgreements.id),
  partyId: text('party_id').notNull().references(() => partiesStakeholders.id),
  partyRole: text('party_role'),
});

export const complianceObligations = sqliteTable('compliance_obligations', {
  id: text('obligation_id').primaryKey(),
  obligationName: text('obligation_name').notNull(),
  appliesTo: text('applies_to'),
  dueDate: text('due_date'),
  status: text('status'),
  assignedOfficer: text('assigned_officer'),
  jurisdiction: text('jurisdiction'),
  supportingDoc: text('supporting_doc'),
  agreementId: text('agreement_id').references(() => activeAgreements.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const legalRequests = sqliteTable('legal_requests', {
  id: text('request_id').primaryKey(),
  requestTitle: text('request_title').notNull(),
  category: text('category'),
  priority: text('priority'),
  status: text('status'),
  assignedMember: text('assigned_member'),
  dateSubmitted: text('date_submitted'),
  resolutionNotes: text('resolution_notes'),
  committeeId: text('committee_id').references(() => committees.id),
  partyId: text('party_id').references(() => partiesStakeholders.id),
  agreementId: text('agreement_id').references(() => activeAgreements.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const intellectualProperty = sqliteTable('intellectual_property', {
  id: text('ip_id').primaryKey(),
  assetName: text('asset_name').notNull(),
  ipType: text('ip_type'),
  registeredOwner: text('registered_owner'),
  registrationNumber: text('registration_number'),
  jurisdiction: text('jurisdiction'),
  filingDate: text('filing_date'),
  expiryDate: text('expiry_date'),
  status: text('status'),
  supportingDocs: text('supporting_docs'),
  partyId: text('party_id').references(() => partiesStakeholders.id), // Owner
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const legalSops = sqliteTable('legal_sops', {
  id: text('sop_id').primaryKey(),
  sopTitle: text('sop_title').notNull(),
  applicableDept: text('applicable_dept'),
  policyType: text('policy_type'),
  effectiveDate: text('effective_date'),
  lastReviewed: text('last_reviewed'),
  owner: text('owner'),
  approvalStatus: text('approval_status'),
  docAttachment: text('doc_attachment'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
