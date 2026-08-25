-- Human-in-the-loop approvals for the accountant agent.
--
-- Some actions must not happen because a model decided they should: opening a
-- new account, linking a ledger, running payroll for everyone, marking a
-- deadline filed. The spec asks for these to be gated "at the tool layer, not
-- just requested in the prompt", and this table is what makes that true — a
-- prompt instruction can be argued around by text inside an invoice
-- description, a missing row cannot.
--
-- Flow: the agent calls a gated tool without a token, which creates a row here
-- and returns its id instead of acting. The operator approves it (agent UI or
-- Slack), which sets status='approved'. The agent then retries with the token,
-- and the tool executes exactly the payload that was approved — the payload is
-- stored here precisely so the thing approved and the thing executed cannot
-- drift apart.
CREATE TABLE IF NOT EXISTS agent_approvals (
	id TEXT PRIMARY KEY,
	tool_name TEXT NOT NULL,
	-- The exact arguments approved. Compared on execution, so an approval for
	-- one payload can never be replayed against a different one.
	payload TEXT NOT NULL,
	payload_hash TEXT NOT NULL,
	summary TEXT NOT NULL,          -- what the operator is being asked to allow
	-- pending | approved | rejected | consumed | expired
	status TEXT NOT NULL DEFAULT 'pending',
	requested_by TEXT NOT NULL,     -- users_logins.id the agent was acting as
	decided_by TEXT,                -- users_logins.id who approved or rejected
	decided_at INTEGER,
	consumed_at INTEGER,
	-- Approvals are short-lived: an hour-old "yes" to opening an account should
	-- not authorise it tomorrow.
	expires_at INTEGER NOT NULL,
	created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS agent_approvals_status_idx
	ON agent_approvals (status, expires_at);

CREATE INDEX IF NOT EXISTS agent_approvals_requester_idx
	ON agent_approvals (requested_by, created_at);
