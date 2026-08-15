-- Add `lines` column to general_journals to support compound journal entries
-- (multi-debit / multi-credit per entry)
-- Format: JSON array of { accountId: string, type: 'debit'|'credit', amount: number }
-- NULL means legacy single-line entry (uses debit_account_id / credit_account_id / amount)

ALTER TABLE general_journals ADD COLUMN lines TEXT;
