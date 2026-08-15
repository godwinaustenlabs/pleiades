import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const campaigns = sqliteTable('campaigns', {
  id: text('campaign_id').primaryKey(),
  campaignName: text('campaign_name').notNull(),
  type: text('type'),
  objective: text('objective'),
  budget: real('budget'),
  startDate: text('start_date'),
  endDate: text('end_date'),
  leadsGenerated: integer('leads_generated'),
  roi: real('roi'),
  status: text('status'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const contactsLeads = sqliteTable('contacts_leads', {
  id: text('contact_id').primaryKey(),
  fullName: text('full_name').notNull(),
  companyName: text('company_name'),
  email: text('email'),
  phone: text('phone'),
  leadSource: text('lead_source'),
  pipelineStage: text('pipeline_stage'),
  contactOwner: text('contact_owner'),
  leadScore: integer('lead_score'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const leadsActivity = sqliteTable('leads_activity', {
  id: text('activity_id').primaryKey(),
  activityType: text('activity_type'),
  timestamp: integer('timestamp', { mode: 'timestamp' }),
  notes: text('notes'),
  automationTrigger: integer('automation_trigger', { mode: 'boolean' }),
  contactId: text('contact_id').references(() => contactsLeads.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const funnelsPipelines = sqliteTable('funnels_pipelines', {
  id: text('funnel_id').primaryKey(),
  funnelName: text('funnel_name').notNull(),
  conversionRatePct: real('conversion_rate_pct'),
  stages: text('stages', { mode: 'json' }), // JSONB representation
  leadEntryCount: integer('lead_entry_count'),
  conversions: integer('conversions'),
  campaignId: text('campaign_id').references(() => campaigns.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const contentCalendar = sqliteTable('content_calendar', {
  id: text('content_id').primaryKey(),
  contentTitle: text('content_title').notNull(),
  channel: text('channel'),
  owner: text('owner'),
  publishDate: text('publish_date'),
  status: text('status'),
  engagement: integer('engagement'),
  views: integer('views'),
  clickThroughRate: real('click_through_rate'),
  campaignId: text('campaign_id').references(() => campaigns.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const sprints = sqliteTable('sprints', {
  id: text('sprint_id').primaryKey(),
  sprintName: text('sprint_name').notNull(),
  startDate: text('start_date'),
  endDate: text('end_date'),
  sprintGoals: text('sprint_goals'),
  status: text('status'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const acqTasks = sqliteTable('acq_tasks', {
  id: text('task_id').primaryKey(),
  taskName: text('task_name').notNull(),
  description: text('description'),
  priority: text('priority'),
  dueDate: text('due_date'), // Used by Slack Agent filter
  assignee: text('assignee'),

  status: text('status'),
  estimatedEffort: real('estimated_effort'),
  actualEffort: real('actual_effort'),
  sprintId: text('sprint_id').references(() => sprints.id),
  campaignId: text('campaign_id').references(() => campaigns.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const outreachLogs = sqliteTable('outreach_logs', {
  id: text('log_id').primaryKey(),
  date: text('date').notNull(),
  dmsSent: integer('dms_sent').default(0),
  emailsSent: integer('emails_sent').default(0),
  repliesReceived: integer('replies_received').default(0),
  forwards: integer('forwards').default(0),
  meetingsBooked: integer('meetings_booked').default(0),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const dealPipelines = sqliteTable('deal_pipelines', {
  id: text('pipeline_id').primaryKey(),
  pipelineName: text('pipeline_name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const dealStages = sqliteTable('deal_stages', {
  id: text('stage_id').primaryKey(),
  pipelineId: text('pipeline_id').references(() => dealPipelines.id).notNull(),
  stageName: text('stage_name').notNull(),
  orderIndex: integer('order_index').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const deals = sqliteTable('deals', {
  id: text('deal_id').primaryKey(),
  dealName: text('deal_name').notNull(),
  amount: real('amount').default(0),
  pipelineId: text('pipeline_id').references(() => dealPipelines.id).notNull(),
  stageId: text('stage_id').references(() => dealStages.id).notNull(),
  contactId: text('contact_id').references(() => contactsLeads.id),
  closeDate: text('close_date'),
  owner: text('owner'),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
