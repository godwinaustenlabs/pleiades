-- Let a mailbox decide the service per message instead of once, forever.
--
-- 0040 put a `transport` column on `mailboxes` and that was too coarse. A
-- department mailbox has to reach two kinds of recipient — a colleague and a
-- client — and the two services differ on exactly that:
--
--   Cloudflare  free and uncapped on this plan, but delivers only to addresses
--               registered as verified destinations. A client is refused.
--   Resend      reaches anybody, but the free tier is 100 a day across the whole
--               ACCOUNT, so every internal message sent this way is one fewer
--               available for a prospect.
--
-- Fixed per mailbox, either choice is wrong half the time: `hr@` on Resend spends
-- the day's allowance telling staff their tasks changed, and `hr@` on Cloudflare
-- cannot write to a candidate at all.
--
-- So `auto` becomes the default and the decision moves to send time: try the free
-- path, and fall back to Resend when it refuses. Self-correcting rather than
-- bookkept — the alternative was mirroring Cloudflare's verified-destination list
-- in a table here, which is a second copy of somebody else's truth and would drift
-- the first time an address was added on one side only.
--
-- `cloudflare` and `resend` remain as explicit overrides, for a mailbox that must
-- never touch a third party (payroll) or must never risk a refusal (outreach).

UPDATE mailboxes SET transport = 'auto' WHERE transport = 'resend' AND kind <> 'system';

-- Which service ACTUALLY sent it, as opposed to which one the mailbox is set to.
--
-- Needed for two things, and the first is the quota: with `auto` in play, the
-- number that matters is how many messages really went through Resend today, not
-- how many mailboxes are configured for it. The second is answering "did this cost
-- us anything" about a single message in the sent log, months later.
ALTER TABLE email_delivery ADD COLUMN transport TEXT;

CREATE INDEX IF NOT EXISTS idx_email_delivery_transport ON email_delivery (transport, queued_at);
