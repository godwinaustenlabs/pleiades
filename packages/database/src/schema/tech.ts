import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { committees } from './core';

export const projects = sqliteTable('projects', {
  id: text('project_id').primaryKey(),
  projectName: text('project_name').notNull(),
  description: text('description'),
  startDate: text('start_date'),
  endDate: text('end_date'),
  status: text('status'),
  priority: text('priority'),
  budget: real('budget'),
  clientName: text('client_name'), // Denormalized ref to Core clients
  committeeId: text('committee_id').references(() => committees.id),
  owner: text('owner'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const epics = sqliteTable('epics', {
  id: text('epic_id').primaryKey(),
  epicName: text('epic_name').notNull(),
  description: text('description'),
  status: text('status'),
  priority: text('priority'),
  startDate: text('start_date'),
  targetEndDate: text('target_end_date'),
  owner: text('owner'),
  projectId: text('project_id').references(() => projects.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const stories = sqliteTable('stories', {
  id: text('story_id').primaryKey(),
  storyTitle: text('story_title').notNull(),
  description: text('description'),
  status: text('status'),
  storyPoints: integer('story_points'),
  priority: text('priority'),
  acceptanceCriteria: text('acceptance_criteria'),
  tags: text('tags'),
  dueDate: text('due_date'),
  epicId: text('epic_id').references(() => epics.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const releases = sqliteTable('releases', {
  id: text('release_id').primaryKey(),
  releaseName: text('release_name').notNull(),
  version: text('version'),
  releaseDate: text('release_date'),
  status: text('status'),
  ciCdResult: text('ci_cd_result'),
  releaseNotes: text('release_notes'),
  releaseOwner: text('release_owner'),
  projectId: text('project_id').references(() => projects.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const tasks = sqliteTable('tasks', {
  id: text('task_id').primaryKey(),
  taskName: text('task_name').notNull(),
  description: text('description'),
  status: text('status'),
  priority: text('priority'),
  assignee: text('assignee'), // Display name

  dueDate: text('due_date'), // Used by Slack Agent filter
  taskType: text('task_type'),
  estimatedHours: real('estimated_hours'),
  actualHours: real('actual_hours'),
  completed: integer('completed', { mode: 'boolean' }),
  storyId: text('story_id').references(() => stories.id),
  releaseId: text('release_id').references(() => releases.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const environments = sqliteTable('environments', {
  id: text('env_id').primaryKey(),
  envName: text('env_name').notNull(),
  envType: text('env_type'),
  status: text('status'),
  uptimePct: real('uptime_pct'),
  errorRatePct: real('error_rate_pct'),
  avgLatencyMs: real('avg_latency_ms'),
  monthlyCost: real('monthly_cost'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const deployments = sqliteTable('deployments', {
  id: text('deployment_id').primaryKey(),
  deploymentName: text('deployment_name').notNull(),
  deploymentStatus: text('deployment_status'),
  initiatedBy: text('initiated_by'),
  startTime: integer('start_time', { mode: 'timestamp' }),
  endTime: integer('end_time', { mode: 'timestamp' }),
  ciCdResult: text('ci_cd_result'),
  rollbackAvailable: integer('rollback_available', { mode: 'boolean' }),
  logs: text('logs'),
  projectId: text('project_id').references(() => projects.id),
  envId: text('env_id').references(() => environments.id),
  releaseId: text('release_id').references(() => releases.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const issues = sqliteTable('issues', {
  id: text('issue_id').primaryKey(),
  issueTitle: text('issue_title').notNull(),
  description: text('description'),
  severity: text('severity'),
  status: text('status'),
  slaTargetDate: text('sla_target_date'),
  reportedDate: text('reported_date'),
  resolvedDate: text('resolved_date'),
  assignedTo: text('assigned_to'),
  projectId: text('project_id').references(() => projects.id),
  storyId: text('story_id').references(() => stories.id),
  envId: text('env_id').references(() => environments.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
