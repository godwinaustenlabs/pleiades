-- One of the currencies is the company's own.
--
-- `accounts.currency` has always existed and the UI has always ignored it: every
-- amount rendered through `GAGrid`'s `currency` column type, and the two balance
-- columns on the accounts table, hardcoded a `$`. Every account in this database is
-- PKR, so every figure on the Accounts screen was labelled in the wrong currency.
--
-- Fixing that for accounts is just reading the column. The harder half is everything
-- that has NO currency column — transactions, invoices, fund requests, payroll,
-- the asset register — which are all in the company's own money. There was nowhere
-- to look that up, so the choice was between keeping the hardcoded `$` for those
-- (the same bug, one screen over) and inventing a default in the client.
--
-- This is the third option: the catalogue says which one is the company's. It lives
-- here rather than in `compliance_config` for a practical reason as well as a tidy
-- one — `GET /api/finance/currencies` is gated on `finance/accounts` view, which
-- every finance screen already holds, whereas the compliance config needs
-- `finance/agent_config` and would have 403'd for exactly the people looking at the
-- accounts.
ALTER TABLE currencies ADD COLUMN is_base INTEGER NOT NULL DEFAULT 0;

-- At most one, enforced rather than assumed. A partial unique index is the only way
-- to say "one row may hold this flag" in SQLite; without it, two bases is a silent
-- state where which symbol you get depends on row order.
CREATE UNIQUE INDEX IF NOT EXISTS currencies_one_base ON currencies (is_base) WHERE is_base = 1;

-- PKR, because that is what every account in this database is denominated in and
-- what the company files in. Operator-editable from the Accounts screen — this is a
-- starting value, not a constant.
UPDATE currencies SET is_base = 1 WHERE code = 'PKR';

-- And if PKR is absent — a database seeded differently — the first active code, so
-- there is always exactly one base rather than none. `is_base` being nowhere means
-- amounts fall back to the bare number, which is correct but unhelpful.
UPDATE currencies SET is_base = 1
WHERE NOT EXISTS (SELECT 1 FROM currencies WHERE is_base = 1)
  AND currency_id = (SELECT currency_id FROM currencies WHERE is_active = 1 ORDER BY code LIMIT 1);
