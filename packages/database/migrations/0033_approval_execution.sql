-- Record what happened when an approved action ran.
--
-- Before this, `decideApproval` only flipped the row to `approved` and stopped.
-- Nothing executed: carrying the action out required the agent to call the same
-- tool again with a byte-identical payload plus the token, which it could not do
-- because it had no conversation memory to recall either. Approving in the UI
-- therefore did nothing, and the UI told the operator to paste the approval id
-- into the chat by hand.
--
-- Now approval executes the stored payload directly. These columns exist so the
-- outcome is visible: an action that was approved and then failed must not look
-- identical to one that was approved and succeeded, and `consumed` alone cannot
-- tell those apart.
ALTER TABLE agent_approvals ADD COLUMN execution_status TEXT;
ALTER TABLE agent_approvals ADD COLUMN execution_result TEXT;
ALTER TABLE agent_approvals ADD COLUMN executed_at INTEGER;
