-- Record which automation sent a message.
--
-- `EnqueueRequest.eventKey` existed from the start, every transactional caller
-- passed it, and `enqueue` dropped it on the floor — a field declared in the type,
-- read by nothing, which is the exact shape of dead configuration CLAUDE.md's note
-- on the Env type complains about. Found while building the automations view, which
-- could not be built without it: there was no way to ask "what has no-reply@
-- actually been sending".
--
-- Nullable on purpose. A message somebody typed has no event, and a null here is
-- the difference between automated and hand-written mail.

ALTER TABLE email_messages ADD COLUMN event_key TEXT;

CREATE INDEX IF NOT EXISTS idx_email_messages_event ON email_messages (event_key, created_at);
