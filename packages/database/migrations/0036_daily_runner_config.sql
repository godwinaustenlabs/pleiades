-- The daily runner's operator.
--
-- The scheduled run has no logged-in user, and an agent turn with no actor
-- would either have to bypass authorisation entirely or be given a privileged
-- identity of its own. Both are worse than the third option: name a real
-- account, and let every tool call the run makes be bounded by that person's
-- grants exactly as an interactive turn is.
--
-- Left unset on purpose. The runner refuses to run rather than picking someone,
-- because guessing whose authority to act under is not a decision code should
-- make. Set it in Accounting → Accountant → Compliance settings.

INSERT OR IGNORE INTO compliance_config
	(id, config_key, group_name, label, description, value_type, unit, value,
	 required, sort_order, effective_from, created_at, updated_at)
VALUES (
	'cc_daily_runner_actor',
	'daily_runner_actor',
	'company',
	'Daily runner operator',
	'The users_logins id the twice-daily check runs as. Its tool calls are limited to that '
		|| 'person''s permissions. Leave blank to switch the scheduled run off.',
	'text',
	NULL,
	NULL,
	0,
	90,
	'2020-01-01',
	unixepoch(),
	unixepoch()
);
