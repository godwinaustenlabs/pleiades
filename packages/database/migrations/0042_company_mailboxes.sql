-- The company's actual mailboxes.
--
-- Unlike 0038's seeds, these are ORGANISATION configuration rather than a code
-- dependency: no code path breaks if one is renamed or deleted, and they are all
-- editable on the Access page. They are here so a fresh database arrives usable
-- instead of needing three manual creations, and so the routing decision is
-- recorded somewhere a future reader can see it.
--
-- `hello@` and `jobs@` are the two addresses the marketing site publishes
-- (godwinausten.org/src/lib/site.ts), which is what decides where they belong:
--
--   hello@  -> acquisition   "Work with us". An enquiry here is a lead, and it
--                            should sit beside contacts, deals and outreach
--                            rather than in a general inbox somebody remembers
--                            to check.
--   jobs@   -> hr            An application belongs with the people who hire.
--   hr@     -> hr            Internal people matters. Kept separate from jobs@ so
--                            a salary question and a CV are not in one stream.
--
-- All three are `transport = 'auto'`: each writes to colleagues AND to outsiders,
-- which is exactly the case a fixed transport gets wrong half the time.
--
-- Not seeded, deliberately: personal mailboxes. Those name a specific person, and
-- a migration that hardcodes who works here is wrong the first time somebody
-- joins or leaves. Create them on the Access page.

INSERT OR IGNORE INTO mailboxes
  (mailbox_id, address, display_name, kind, app_name, transport, daily_send_cap, is_active, created_at, updated_at)
VALUES
  ('mbx_hello', 'hello@godwinausten.org', 'Godwin Austen Labs', 'app', 'acquisition', 'auto', 40, 1, unixepoch(), unixepoch()),
  ('mbx_jobs',  'jobs@godwinausten.org',  'Careers',            'app', 'hr',          'auto', 40, 1, unixepoch(), unixepoch()),
  ('mbx_hr',    'hr@godwinausten.org',    'People',             'app', 'hr',          'auto', 40, 1, unixepoch(), unixepoch());
