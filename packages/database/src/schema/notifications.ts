import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { usersLogins } from './auth';
import { universalTasks } from './unified_tasks';

export const userNotifications = sqliteTable('user_notifications', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => usersLogins.id),
  type: text('type').notNull(), // 'ticket_update' | 'task_assign' | 'system'
  title: text('title').notNull(),
  message: text('message').notNull(),
  link: text('link'),          // Optional URL to navigate to
  isRead: integer('is_read', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const taskAttachments = sqliteTable('task_attachments', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => universalTasks.id),
  title: text('title').notNull(),
  r2Key: text('r2_key').notNull(),
  fileSize: integer('file_size'),
  mimeType: text('mime_type'),
  uploadedById: text('uploaded_by_id').references(() => usersLogins.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
