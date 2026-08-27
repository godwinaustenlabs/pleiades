/**
 * Drizzle ORM Relations
 * Defines all table relationships to enable `with:` queries in db.query.*
 */
import { relations } from 'drizzle-orm';
import {
  usersLogins, apiKeys, userAppPermissions,
  userOwnership, passwordResetTokens, calendarFeeds
} from './auth';
import {
  employees, labs, employeeLab, clients, committees,
  committeeMembers, monthlyReports, coreDocs,
} from './core';
import { sectors, appointments, payrollRecords, legalTracker } from './hr';
import {
  complianceEvents, generatedDocuments, agentConversations,
  conversationTurns,
} from './pleiades';
import {
  accounts, fundRequests, invoices, transactions, plReports,
  ledgers, generalJournals,
} from './finance';
import {
  legalTemplates, partiesStakeholders, activeAgreements, agreementParties,
  complianceObligations, legalRequests, intellectualProperty, legalSops,
} from './legal';
import {
  projects, epics, stories, tasks, releases, environments, deployments, issues,
} from './tech';
import {
  campaigns, contactsLeads, leadsActivity, funnelsPipelines,
  contentCalendar, sprints, acqTasks, dealPipelines, dealStages, deals,
} from './acquisition';
import { universalTasks, taskAssignments } from './unified_tasks';
import {
  crmTickets, crmDocuments, crmPlannerEvents,
  clientLogins, userNotes, userDashboardState,
} from './crm';

/* ── AUTH ── */
export const userAppPermissionsRelations = relations(userAppPermissions, ({ one }) => ({
  user: one(usersLogins, { fields: [userAppPermissions.userId], references: [usersLogins.id] }),
}));

export const usersLoginsRelations = relations(usersLogins, ({ one, many }) => ({
  employee: one(employees, { fields: [usersLogins.employeeId], references: [employees.id] }),
  // What this user can do. There is no role indirection.
  permissions: many(userAppPermissions),
  // Ownership: the manager record that owns this user
  ownership: one(userOwnership, { fields: [usersLogins.id], references: [userOwnership.userId] }),
  // Reset tokens issued for this user
  resetTokens: many(passwordResetTokens),
  // Accounts that this user is the owner of (i.e. accounts they provisioned)
  ownedUsers: many(userOwnership, { relationName: 'ownerRelation' }),
  // Calendar feed token
  calendarFeed: one(calendarFeeds, { fields: [usersLogins.id], references: [calendarFeeds.userId] }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  // The user this agent key acts as; it inherits that user's grants.
  user: one(usersLogins, { fields: [apiKeys.userId], references: [usersLogins.id] }),
}));

/* ── OWNERSHIP, RESET TOKENS ── */
export const userOwnershipRelations = relations(userOwnership, ({ one }) => ({
  user: one(usersLogins, {
    fields: [userOwnership.userId],
    references: [usersLogins.id],
  }),
  owner: one(usersLogins, {
    fields: [userOwnership.ownerUserId],
    references: [usersLogins.id],
    relationName: 'ownerRelation',
  }),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(usersLogins, { fields: [passwordResetTokens.userId], references: [usersLogins.id] }),
}));

export const calendarFeedsRelations = relations(calendarFeeds, ({ one }) => ({
  user: one(usersLogins, { fields: [calendarFeeds.userId], references: [usersLogins.id] }),
}));



/* ── CORE ── */
export const employeesRelations = relations(employees, ({ many, one }) => ({
  employeeLabs: many(employeeLab),
  committeeMembers: many(committeeMembers),
  appointments: many(appointments),
  payrollRecords: many(payrollRecords),
  legalTrackers: many(legalTracker),
  taskAssignments: many(taskAssignments),
  sector: one(sectors, { fields: [employees.sectorId], references: [sectors.id] }),
}));

export const labsRelations = relations(labs, ({ many, one }) => ({
  employeeLabs: many(employeeLab),
  committees: many(committees),
  opsLead: one(employees, { fields: [labs.opsLeadId], references: [employees.id] }),
}));

export const employeeLabRelations = relations(employeeLab, ({ one }) => ({
  employee: one(employees, { fields: [employeeLab.employeeId], references: [employees.id] }),
  lab: one(labs, { fields: [employeeLab.labId], references: [labs.id] }),
}));

export const clientsRelations = relations(clients, ({ many }) => ({
  committees: many(committees),
  invoices: many(invoices),
  transactions: many(transactions),
  coreDocs: many(coreDocs),
}));

export const committeesRelations = relations(committees, ({ many, one }) => ({
  committeeMembers: many(committeeMembers),
  appointments: many(appointments),
  monthlyReports: many(monthlyReports),
  fundRequests: many(fundRequests),
  invoices: many(invoices),
  transactions: many(transactions),
  coreDocs: many(coreDocs),
  projects: many(projects),
  activeAgreements: many(activeAgreements),
  legalRequests: many(legalRequests),
  lab: one(labs, { fields: [committees.labId], references: [labs.id] }),
  client: one(clients, { fields: [committees.clientId], references: [clients.id] }),
}));

export const committeeMembersRelations = relations(committeeMembers, ({ one }) => ({
  committee: one(committees, { fields: [committeeMembers.committeeId], references: [committees.id] }),
  employee: one(employees, { fields: [committeeMembers.employeeId], references: [employees.id] }),
}));

export const monthlyReportsRelations = relations(monthlyReports, ({ one }) => ({
  committee: one(committees, { fields: [monthlyReports.committeeId], references: [committees.id] }),
}));

export const coreDocsRelations = relations(coreDocs, ({ one }) => ({
  committee: one(committees, { fields: [coreDocs.committeeId], references: [committees.id] }),
  client: one(clients, { fields: [coreDocs.clientId], references: [clients.id] }),
}));

/* ── HR ── */
export const sectorsRelations = relations(sectors, ({ many, one }) => ({
  employees: many(employees),
  headEmployee: one(employees, { fields: [sectors.headEmployeeId], references: [employees.id] }),
}));

export const appointmentsRelations = relations(appointments, ({ one }) => ({
  employee: one(employees, { fields: [appointments.employeeId], references: [employees.id] }),
  committee: one(committees, { fields: [appointments.committeeId], references: [committees.id] }),
}));

export const payrollRecordsRelations = relations(payrollRecords, ({ one }) => ({
  employee: one(employees, { fields: [payrollRecords.employeeId], references: [employees.id] }),
}));

export const legalTrackerRelations = relations(legalTracker, ({ one }) => ({
  employee: one(employees, { fields: [legalTracker.employeeId], references: [employees.id] }),
}));

/* ── FINANCE ── */
export const accountsRelations = relations(accounts, ({ many, one }) => ({
  transactions: many(transactions),
  ledger: one(ledgers, { fields: [accounts.ledgerId], references: [ledgers.id] }),
  debitJournals: many(generalJournals, { relationName: 'debitAccountRelation' }),
  creditJournals: many(generalJournals, { relationName: 'creditAccountRelation' }),
}));

export const ledgersRelations = relations(ledgers, ({ many }) => ({
  accounts: many(accounts),
  generalJournals: many(generalJournals),
}));

export const generalJournalsRelations = relations(generalJournals, ({ one }) => ({
  ledger: one(ledgers, { fields: [generalJournals.ledgerId], references: [ledgers.id] }),
  debitAccount: one(accounts, { fields: [generalJournals.debitAccountId], references: [accounts.id], relationName: 'debitAccountRelation' }),
  creditAccount: one(accounts, { fields: [generalJournals.creditAccountId], references: [accounts.id], relationName: 'creditAccountRelation' }),
}));


export const fundRequestsRelations = relations(fundRequests, ({ one, many }) => ({
  committee: one(committees, { fields: [fundRequests.committeeId], references: [committees.id] }),
  invoices: many(invoices),
  transactions: many(transactions),
}));

export const invoicesRelations = relations(invoices, ({ one }) => ({
  client: one(clients, { fields: [invoices.clientId], references: [clients.id] }),
  committee: one(committees, { fields: [invoices.committeeId], references: [committees.id] }),
  fundRequest: one(fundRequests, { fields: [invoices.fundRequestId], references: [fundRequests.id] }),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  committee: one(committees, { fields: [transactions.committeeId], references: [committees.id] }),
  client: one(clients, { fields: [transactions.clientId], references: [clients.id] }),
  account: one(accounts, { fields: [transactions.accountId], references: [accounts.id] }),
  invoice: one(invoices, { fields: [transactions.invoiceId], references: [invoices.id] }),
  fundRequest: one(fundRequests, { fields: [transactions.fundRequestId], references: [fundRequests.id] }),
}));

/* ── LEGAL ── */
export const legalTemplatesRelations = relations(legalTemplates, ({ many }) => ({
  activeAgreements: many(activeAgreements),
}));

export const partiesStakeholdersRelations = relations(partiesStakeholders, ({ many }) => ({
  agreementParties: many(agreementParties),
  intellectualProperty: many(intellectualProperty),
  legalRequests: many(legalRequests),
}));

export const activeAgreementsRelations = relations(activeAgreements, ({ one, many }) => ({
  committee: one(committees, { fields: [activeAgreements.committeeId], references: [committees.id] }),
  template: one(legalTemplates, { fields: [activeAgreements.templateId], references: [legalTemplates.id] }),
  agreementParties: many(agreementParties),
  complianceObligations: many(complianceObligations),
  legalRequests: many(legalRequests),
}));

export const agreementPartiesRelations = relations(agreementParties, ({ one }) => ({
  agreement: one(activeAgreements, { fields: [agreementParties.agreementId], references: [activeAgreements.id] }),
  party: one(partiesStakeholders, { fields: [agreementParties.partyId], references: [partiesStakeholders.id] }),
}));

export const complianceObligationsRelations = relations(complianceObligations, ({ one }) => ({
  agreement: one(activeAgreements, { fields: [complianceObligations.agreementId], references: [activeAgreements.id] }),
}));

export const legalRequestsRelations = relations(legalRequests, ({ one }) => ({
  committee: one(committees, { fields: [legalRequests.committeeId], references: [committees.id] }),
  party: one(partiesStakeholders, { fields: [legalRequests.partyId], references: [partiesStakeholders.id] }),
  agreement: one(activeAgreements, { fields: [legalRequests.agreementId], references: [activeAgreements.id] }),
}));

export const intellectualPropertyRelations = relations(intellectualProperty, ({ one }) => ({
  party: one(partiesStakeholders, { fields: [intellectualProperty.partyId], references: [partiesStakeholders.id] }),
}));

/* ── TECH ── */
export const projectsRelations = relations(projects, ({ one, many }) => ({
  committee: one(committees, { fields: [projects.committeeId], references: [committees.id] }),
  epics: many(epics),
  releases: many(releases),
  deployments: many(deployments),
  issues: many(issues),
}));

export const epicsRelations = relations(epics, ({ one, many }) => ({
  project: one(projects, { fields: [epics.projectId], references: [projects.id] }),
  stories: many(stories),
}));

export const storiesRelations = relations(stories, ({ one, many }) => ({
  epic: one(epics, { fields: [stories.epicId], references: [epics.id] }),
  tasks: many(tasks),
  issues: many(issues),
}));

export const releasesRelations = relations(releases, ({ one, many }) => ({
  project: one(projects, { fields: [releases.projectId], references: [projects.id] }),
  tasks: many(tasks),
  deployments: many(deployments),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  story: one(stories, { fields: [tasks.storyId], references: [stories.id] }),
  release: one(releases, { fields: [tasks.releaseId], references: [releases.id] }),
}));

export const environmentsRelations = relations(environments, ({ many }) => ({
  deployments: many(deployments),
  issues: many(issues),
}));

export const deploymentsRelations = relations(deployments, ({ one }) => ({
  project: one(projects, { fields: [deployments.projectId], references: [projects.id] }),
  env: one(environments, { fields: [deployments.envId], references: [environments.id] }),
  release: one(releases, { fields: [deployments.releaseId], references: [releases.id] }),
}));

export const issuesRelations = relations(issues, ({ one }) => ({
  project: one(projects, { fields: [issues.projectId], references: [projects.id] }),
  story: one(stories, { fields: [issues.storyId], references: [stories.id] }),
  env: one(environments, { fields: [issues.envId], references: [environments.id] }),
}));

/* ── ACQUISITION ── */
export const campaignsRelations = relations(campaigns, ({ many }) => ({
  funnelsPipelines: many(funnelsPipelines),
  contentCalendar: many(contentCalendar),
  acqTasks: many(acqTasks),
}));

export const contactsLeadsRelations = relations(contactsLeads, ({ many }) => ({
  leadsActivity: many(leadsActivity),
}));

export const leadsActivityRelations = relations(leadsActivity, ({ one }) => ({
  contact: one(contactsLeads, { fields: [leadsActivity.contactId], references: [contactsLeads.id] }),
}));

export const funnelsPipelinesRelations = relations(funnelsPipelines, ({ one }) => ({
  campaign: one(campaigns, { fields: [funnelsPipelines.campaignId], references: [campaigns.id] }),
}));

export const contentCalendarRelations = relations(contentCalendar, ({ one }) => ({
  campaign: one(campaigns, { fields: [contentCalendar.campaignId], references: [campaigns.id] }),
}));

export const sprintsRelations = relations(sprints, ({ many }) => ({
  acqTasks: many(acqTasks),
}));

export const acqTasksRelations = relations(acqTasks, ({ one }) => ({
  sprint: one(sprints, { fields: [acqTasks.sprintId], references: [sprints.id] }),
  campaign: one(campaigns, { fields: [acqTasks.campaignId], references: [campaigns.id] }),
}));

export const dealPipelinesRelations = relations(dealPipelines, ({ many }) => ({
  dealStages: many(dealStages),
  deals: many(deals),
}));

export const dealStagesRelations = relations(dealStages, ({ one, many }) => ({
  pipeline: one(dealPipelines, { fields: [dealStages.pipelineId], references: [dealPipelines.id] }),
  deals: many(deals),
}));

export const dealsRelations = relations(deals, ({ one }) => ({
  pipeline: one(dealPipelines, { fields: [deals.pipelineId], references: [dealPipelines.id] }),
  stage: one(dealStages, { fields: [deals.stageId], references: [dealStages.id] }),
  contact: one(contactsLeads, { fields: [deals.contactId], references: [contactsLeads.id] }),
}));

/* ── UNIVERSAL TASKS ── */
export const universalTasksRelations = relations(universalTasks, ({ one, many }) => ({
  assignments: many(taskAssignments),
  creator: one(usersLogins, { fields: [universalTasks.creatorId], references: [usersLogins.id], relationName: 'taskCreator' }),
  appointment: one(appointments, { fields: [universalTasks.appointmentId], references: [appointments.id] }),
  committee: one(committees, { fields: [universalTasks.committeeId], references: [committees.id] }),
}));

export const taskAssignmentsRelations = relations(taskAssignments, ({ one }) => ({
  task: one(universalTasks, { fields: [taskAssignments.taskId], references: [universalTasks.id] }),
  employee: one(employees, { fields: [taskAssignments.employeeId], references: [employees.id] }),
}));

/* ── CRM ── */
export const crmTicketsRelations = relations(crmTickets, ({ one }) => ({
  committee: one(committees, { fields: [crmTickets.committeeId], references: [committees.id] }),
  assignedEmployee: one(employees, { fields: [crmTickets.assignedTo], references: [employees.id] }),
}));

export const crmDocumentsRelations = relations(crmDocuments, ({ one }) => ({
  committee: one(committees, { fields: [crmDocuments.committeeId], references: [committees.id] }),
  uploader: one(usersLogins, { fields: [crmDocuments.uploadedById], references: [usersLogins.id] }),
}));

export const crmPlannerEventsRelations = relations(crmPlannerEvents, ({ one }) => ({
  committee: one(committees, { fields: [crmPlannerEvents.committeeId], references: [committees.id] }),
  creator: one(usersLogins, { fields: [crmPlannerEvents.createdById], references: [usersLogins.id] }),
}));

export const clientLoginsRelations = relations(clientLogins, ({ one }) => ({
  client: one(clients, { fields: [clientLogins.clientId], references: [clients.id] }),
}));

export const userNotesRelations = relations(userNotes, ({ one }) => ({
  user: one(usersLogins, { fields: [userNotes.userId], references: [usersLogins.id] }),
}));

export const userDashboardStateRelations = relations(userDashboardState, ({ one }) => ({
  user: one(usersLogins, { fields: [userDashboardState.userId], references: [usersLogins.id] }),
}));

/* ── PLEIADES ACCOUNTANT ── */
export const complianceEventsRelations = relations(complianceEvents, ({ one }) => ({
  // The draft prepared for this obligation, once one exists.
  draftDocument: one(generatedDocuments, {
    fields: [complianceEvents.draftDocumentId],
    references: [generatedDocuments.id],
  }),
}));

export const generatedDocumentsRelations = relations(generatedDocuments, ({ one }) => ({
  complianceEvent: one(complianceEvents, {
    fields: [generatedDocuments.complianceEventId],
    references: [complianceEvents.id],
  }),
}));

export const agentConversationsRelations = relations(agentConversations, ({ one, many }) => ({
  operatorUser: one(usersLogins, {
    fields: [agentConversations.operator],
    references: [usersLogins.id],
  }),
  turns: many(conversationTurns),
}));

export const conversationTurnsRelations = relations(conversationTurns, ({ one }) => ({
  conversation: one(agentConversations, {
    fields: [conversationTurns.conversationId],
    references: [agentConversations.id],
  }),
}));
