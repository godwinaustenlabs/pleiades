-- The asset register: give `assets` a monetary life.
--
-- The table recorded what a thing was and who held it, and nothing about what
-- it cost — no purchase price, no salvage, no useful life, no vendor. HR could
-- hand a laptop to someone, but the company could not say what it owned, so a
-- statement of assets and liabilities had nothing to draw on and depreciation
-- could not be computed at all.
--
-- Added as ALTER TABLE ADD COLUMN rather than a table rebuild: SQLite permits a
-- REFERENCES clause on an added column as long as it defaults to NULL, so the
-- foreign keys to `accounts` need no defer_foreign_keys dance.

ALTER TABLE assets ADD COLUMN purchase_cost real;
ALTER TABLE assets ADD COLUMN purchase_date text;
ALTER TABLE assets ADD COLUMN salvage_value real DEFAULT 0;
ALTER TABLE assets ADD COLUMN useful_life_months integer;

-- Groups the register for reporting and sets the default life when one is not
-- given per asset. Stationery is deliberately included: it is expensed, not
-- capitalised, and the class is how the statement knows to leave it out.
ALTER TABLE assets ADD COLUMN asset_class text DEFAULT 'other';

ALTER TABLE assets ADD COLUMN serial_number text;
ALTER TABLE assets ADD COLUMN vendor text;
ALTER TABLE assets ADD COLUMN depreciation_method text DEFAULT 'straight_line';
ALTER TABLE assets ADD COLUMN accumulated_depreciation real DEFAULT 0;

-- The last period (YYYY-MM) posted to the ledger for this asset. Posting reads
-- it and refuses to charge a month twice; without it a re-run would silently
-- double the expense.
ALTER TABLE assets ADD COLUMN last_depreciation_period text;

ALTER TABLE assets ADD COLUMN disposed_at text;
ALTER TABLE assets ADD COLUMN disposal_proceeds real;
ALTER TABLE assets ADD COLUMN notes text;

-- Where this asset sits in the books. Nullable: the register is useful before
-- the chart of accounts is wired up, and depreciation simply cannot be posted
-- until both accounts are set.
ALTER TABLE assets ADD COLUMN asset_account_id text REFERENCES accounts(account_id);
ALTER TABLE assets ADD COLUMN depreciation_expense_account_id text REFERENCES accounts(account_id);
ALTER TABLE assets ADD COLUMN accumulated_depreciation_account_id text REFERENCES accounts(account_id);

ALTER TABLE assets ADD COLUMN updated_at integer;

CREATE INDEX IF NOT EXISTS idx_assets_class ON assets(asset_class);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
