-- The currency a finance account is denominated in used to be a five-item list
-- hardcoded in the Finance page's two account forms (USD, EUR, GBP, AED, INR).
-- Adding one meant a code change and a deploy, and the list did not even
-- include PKR — the currency every statement this company issues is actually
-- printed in (src/statements/file.ts).
--
-- The list lives here instead, so operators can add what they need and every
-- account picks from the same set.
--
-- `code` is the natural key and is what `accounts.currency` already stores, so
-- no backfill and no foreign key is needed: existing rows keep working, and an
-- account denominated in something later deactivated still says what it is.

CREATE TABLE IF NOT EXISTS currencies (
  currency_id        TEXT PRIMARY KEY,
  code               TEXT NOT NULL UNIQUE,
  name               TEXT,
  symbol             TEXT,
  is_active          INTEGER NOT NULL DEFAULT 1,
  created_by_user_id TEXT,
  created_at         INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_currencies_active ON currencies (is_active);

-- The five that were hardcoded, plus the one that was missing.
INSERT OR IGNORE INTO currencies (currency_id, code, name, symbol, is_active, created_at) VALUES
  ('cur_pkr', 'PKR', 'Pakistani Rupee',       'Rs',  1, 0),
  ('cur_usd', 'USD', 'United States Dollar',  '$',   1, 0),
  ('cur_eur', 'EUR', 'Euro',                  '€',   1, 0),
  ('cur_gbp', 'GBP', 'Pound Sterling',        '£',   1, 0),
  ('cur_aed', 'AED', 'UAE Dirham',            'AED', 1, 0),
  ('cur_inr', 'INR', 'Indian Rupee',          '₹',   1, 0);
