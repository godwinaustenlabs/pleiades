-- Migration: Add can_create_tasks to user_app_access and client_id to active_agreements

-- Add can_create_tasks to user_app_access
ALTER TABLE user_app_access ADD COLUMN can_create_tasks INTEGER DEFAULT 1;

-- Add client_id to active_agreements
ALTER TABLE active_agreements ADD COLUMN client_id TEXT;
