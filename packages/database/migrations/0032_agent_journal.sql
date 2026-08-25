-- The agent's working journal: what it did, and why.
--
-- Two reasons this is a table and not only vectors:
--
--   Recall  — "have I handled something like this before?" is a semantic
--             question, answered from Vectorize.
--   Record  — "what did you file in August, and why was it nil?" is an exact
--             question, and an auditor asking it will not accept an embedding
--             similarity score as an answer. It needs rows, in order, with
--             dates.
--
-- So every entry is written here first and embedded second. If the embedding
-- fails the record still exists; a journal that silently loses entries is worse
-- than no journal, because it looks complete.
--
-- `rationale` is the point of the whole thing. A nil return that says nothing
-- is indistinguishable, months later, from a return nobody got round to. One
-- that says "no taxable supplies in the period; nil filed to preserve the
-- filing record" explains itself without anyone having to reconstruct it.
CREATE TABLE IF NOT EXISTS agent_journal (
	id TEXT PRIMARY KEY,
	-- What kind of thing happened, so the timeline can be filtered without
	-- relying on the prose: account_created | payroll_generated |
	-- statement_generated | journal_posted | salary_structure_set | …
	action_type TEXT NOT NULL,
	subject TEXT NOT NULL,          -- the thing acted on, in human terms
	summary TEXT NOT NULL,          -- what was done
	rationale TEXT,                 -- why, including why a figure was nil
	-- Related record ids as JSON, so an entry can be traced back to the payroll
	-- run or journal entry it describes.
	entities TEXT,
	period_label TEXT,              -- '2026-08' | 'TY2027', when it applies to one
	outcome TEXT NOT NULL DEFAULT 'completed', -- completed | refused | blocked
	actor_user_id TEXT NOT NULL,    -- who the agent was acting as
	conversation_id TEXT,
	-- Written automatically by the approval gate, or by the agent itself.
	source TEXT NOT NULL DEFAULT 'agent', -- agent | approval_gate
	vector_id TEXT,                 -- id in Vectorize, once embedded
	occurred_at INTEGER NOT NULL,
	created_at INTEGER NOT NULL
);

-- The timeline query: what happened, most recent first, optionally by kind.
CREATE INDEX IF NOT EXISTS agent_journal_occurred_idx
	ON agent_journal (occurred_at DESC);
CREATE INDEX IF NOT EXISTS agent_journal_type_idx
	ON agent_journal (action_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS agent_journal_period_idx
	ON agent_journal (period_label);
