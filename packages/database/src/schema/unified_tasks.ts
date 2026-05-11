import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { usersLogins } from './auth';
import { employees, committees } from './core';
import { appointments } from './hr';

export const universalTasks = sqliteTable('universal_tasks', {
  id: text('task_id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull(), // todo | in_progress | completed | blocked
  priority: text('priority'), // low | medium | high | urgent
  department: text('department').notNull(), // HR | Finance | Legal | Ops | Acquisition | Tech
  taskType: text('task_type'), // operational | administrative | technical | review | urgent
  
  // Relations — assignee is an EMPLOYEE (not a login user)
  assigneeId: text('assignee_id').references(() => employees.id),
  creatorId: text('creator_id').references(() => usersLogins.id),
  
  // Assignment to appointments and committees
  appointmentId: text('appointment_id').references(() => appointments.id),
  committeeId: text('committee_id').references(() => committees.id),
  
  // Drag-and-drop ordering within a status column
  boardPosition: integer('board_position').default(0),
  
  // Generic link to other entities (e.g. project_id, etc.)
  relatedEntityId: text('related_entity_id'),
  relatedEntityType: text('related_entity_type'),
  
  estimatedHours: real('estimated_hours'),
  dueDate: text('due_date'),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});
