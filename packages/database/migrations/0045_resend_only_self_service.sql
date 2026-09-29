-- Resend is the only transport, and password reset is self-service.
--
-- Two decisions, one migration, because both remove things.
--
-- ── One transport ───────────────────────────────────────────────────────────
--
-- Cloudflare Email Sending is gone. On the Workers Free plan it delivers only to
-- verified destination addresses — the external addresses Email Routing forwards TO
-- — and once the apex MX moved into Cloudflare every staff address became an
-- own-domain address, which cannot be one. It was never verified on this account
-- either (`cf-bounce._domainkey` publishes an empty key), so in practice every send
-- was refused and fell through to Resend anyway, costing a doomed API call first.
--
-- So `mailboxes.transport` and `email_delivery.transport_override` now describe a
-- choice that does not exist. `email_delivery.transport` STAYS: it records what
-- actually carried a message, is set only on success, and is what the account-wide
-- daily cap counts — a cap that counted all delivery rows would charge quota for
-- messages that never reached Resend.
--
-- ── No approval queue ───────────────────────────────────────────────────────
--
-- `hr/resets` and `admin/resets` gated GET /admin/pending-resets and its approve and
-- reject routes, which are deleted. Reset is now self-service: a person types their
-- email or username and a single-use link, good for ten minutes, is emailed to them.
-- The queue meant somebody locked out at 9pm stayed locked out until a colleague
-- noticed a list.
--
-- Those grants are deleted rather than left behind. A grant naming a feature that
-- APP_FEATURES no longer declares can never be satisfied, so it is a tick-box in the
-- Access page that grants nothing — exactly the confusion the finance/ledgers and
-- acquisition/funnels comments in rbac.ts warn about, in reverse.

DROP INDEX IF EXISTS idx_mailboxes_transport;
ALTER TABLE mailboxes DROP COLUMN transport;
ALTER TABLE email_delivery DROP COLUMN transport_override;

DELETE FROM user_app_permissions WHERE feature = 'resets' AND app_name IN ('hr', 'admin');

-- The HR notification that a reset was waiting. There is no queue to wait in.
DELETE FROM email_templates WHERE key = 'reset_requested';
