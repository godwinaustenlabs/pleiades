-- Which service a mailbox sends through.
--
-- This account is on the Workers FREE plan, and Cloudflare Email Sending splits
-- on exactly that line: "sending to verified destination addresses is free on all
-- plans", but sending to an arbitrary recipient needs Workers Paid. So one
-- transport cannot serve both halves of this system:
--
--   no-reply@ -> staff, every one of them a verified destination
--                -> env.EMAIL, free, no daily cap
--   hr@, sales@, … -> candidates, prospects, clients, whoever was typed in
--                -> Resend, because Cloudflare would refuse them on this plan
--
-- Stored as a column rather than derived from the address or the `kind`, because
-- a rule like "the outreach subdomain means Resend" is invisible at the point
-- somebody creates a mailbox and wrong the first time an exception is needed.
-- It is shown in the mailbox list on the Access page for the same reason.
--
-- The DNS does not collide: Cloudflare signs with the `cf-bounce` selector on the
-- apex, Resend uses `resend._domainkey` on whichever domain is verified with it.
-- Verify a SUBDOMAIN with Resend rather than the apex, so the root SPF —
-- currently `v=spf1 include:secureserver.net -all`, a hard fail that GoDaddy's
-- mailboxes depend on — is never edited.

ALTER TABLE mailboxes ADD COLUMN transport TEXT NOT NULL DEFAULT 'resend';

-- The system mailbox is the one that can use the free path: everything it sends
-- is transactional mail to staff, and staff addresses are what get registered as
-- verified destinations.
UPDATE mailboxes SET transport = 'cloudflare' WHERE kind = 'system';

-- Resend's free tier allows 100 messages a day PER ACCOUNT, not per sender, so a
-- per-mailbox cap cannot enforce it — three mailboxes at 200 each would sail past
-- it and start failing mid-afternoon with no warning. `enqueue` counts the whole
-- account's Resend traffic against RESEND_DAILY_CAP separately; these per-mailbox
-- numbers are the narrower limit on top of that, so one department cannot spend
-- the whole day's allowance before anybody else is awake.
UPDATE mailboxes SET daily_send_cap = 40 WHERE transport = 'resend' AND daily_send_cap > 40;

CREATE INDEX IF NOT EXISTS idx_mailboxes_transport ON mailboxes (transport);
