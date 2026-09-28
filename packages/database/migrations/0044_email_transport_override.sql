-- Let one message pin its transport, independently of its mailbox.
--
-- `mbx_system` was pinned to `cloudflare` so that a payroll or password-reset
-- notice could not quietly route through a third party. The first real send in
-- production showed that reasoning to be half right and half harmful:
--
--   Cloudflare refused hr@godwinausten.org with E_RECIPIENT_NOT_ALLOWED.
--
-- On the Workers Free plan the Cloudflare path delivers only to *verified
-- destination addresses*, and those are the external addresses Email Routing
-- forwards TO — an address on our own domain cannot be one. So a mailbox pinned to
-- `cloudflare` cannot reach any internal address at all, and being pinned, it could
-- not fall back either. The HR notification failed with nobody told.
--
-- The pin therefore belongs on the message, not the mailbox. `dispatch` sets it for
-- events marked `sensitive` — today only `password_reset`, whose recipient is a
-- `recovery_email` that is validated to be OFF the company domain and is therefore
-- exactly the kind of address the free path CAN deliver to. Everything else is
-- `auto` and falls back so that it arrives.
--
-- Nullable: a null means "use the mailbox's setting", which is every hand-written
-- message.

ALTER TABLE email_delivery ADD COLUMN transport_override TEXT;

-- And with the pin moved to the message, the mailbox goes back to deciding per
-- recipient. Without this, every notification from no-reply@ to an own-domain
-- address still fails: the mailbox setting is what enqueue falls back to when a
-- message carries no override, which is every hand-written one.
UPDATE mailboxes SET transport = 'auto' WHERE mailbox_id = 'mbx_system';
