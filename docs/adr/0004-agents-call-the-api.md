# 0004 — Agents act only through the Worker's own API, never SQL

**Status:** Accepted

**Context.** D1 has no read-only role or per-table grants. An agent with a SQL tool
could read `users_logins`, `api_keys` and payroll in full, and any prompt injection
in free text (an invoice description, a Slack message) would become a database read.

**Decision.** Agent tools are fixed-path calls to the Worker's own API, carrying
`x-agent-actor` + `x-agent-secret` for the person the agent acts for. Every call
passes the same `authMiddleware → requireAppAccess → requireFeatureAccess` chain as
a browser. Consequential actions are gated in code (`agent_approvals`), not by
prompt. There is never a `query_d1`-style tool.

**Consequences.** An agent can never exceed the person it acts for, and there is one
authorization implementation. New agent capabilities need an API route first — the
Slack agent's repeating-task tools (October 2026) call the same routes the UI does.
