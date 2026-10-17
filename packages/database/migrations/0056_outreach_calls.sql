-- The outreach tracker counts calls made, beside DMs and emails sent.
-- Additive: existing days read as 0 calls, which is what was logged for them.
ALTER TABLE outreach_logs ADD COLUMN calls_made INTEGER DEFAULT 0;
