# Pleiades Accountant — Specification

**For:** Godwin Austen Labs
**Stack:** Cloudflare Agents SDK (Workers + Durable Objects), `office-db` (D1), R2
**Original draft:** August 2026 · **Rewritten to match the build:** 25 August 2026

---

## What this document is

The first draft of this spec was written before any of it existed, and guessed
at several things. This version describes what is actually built, why it differs
where it does, and what is genuinely still outstanding. Where the original made
a recommendation we did not follow, the reason is recorded rather than deleted —
those reasons are the useful part.

**Status: the agent runs.** It reads the operator's compliance configuration,
answers over live HR and accounting data, refuses to invent figures, and stops
for a human before anything consequential. What it cannot yet do is render a
formatted statement file or act on a schedule; both are listed under
[What is left](#what-is-left).

---

## SECTION A — The core rule

> **Compliance figures belong to the operator. Not to the model, not to the
> prompt, not to a migration.**

Everything else follows from this. Tax rates, the EOBI wage base, the tax-year
boundary, filing deadlines and the company's own registration details change
with each Finance Act and each provincial notification. The people who know
those numbers are the operator and their accountant.

So there is exactly one place a rate lives: the `compliance_config` table,
edited through the agent settings UI, injected into the system prompt at the
start of every turn. The prompt itself contains no numbers. Nothing is
hardcoded, and nothing is remembered.

The corollary is just as important: **an unset value is a refusal, not a gap to
fill.** When the operator has not entered the salary slab table, the agent does
not reach for a plausible one — it says which setting is missing and stops. A
wrong number in an accounting draft is worse than an admitted gap, and the
difference between those two outcomes is the whole point of the design.

Verified in production:

> **Q:** What is our salary withholding rate for someone on 2,400,000 a year?
> **A:** I cannot provide the salary withholding rate. The `Salary tax slabs`
> setting is not configured. Please configure it in the agent settings.

### Operating principles (in the prompt, enforced in code)

| Principle | How it is actually enforced |
|---|---|
| Numbers come from tools and configuration | Calculators read `compliance_config` and return a typed refusal; no default paths exist |
| Draft, never file | No filing tool exists to call |
| Consequential actions need approval | `agent_approvals` row required before the tool executes |
| Cite your basis | Calculators return a `basis` array with every result |
| PII discipline | Prompt rule; the agent has no tool that emails or posts salary figures |
| Escalate, do not smooth | Prompt rule, reinforced by calculators that refuse rather than approximate |

---

## SECTION B — Configuration model

`compliance_config` — 48 typed variables across 13 groups. Each row is one field
in the settings UI.

| Column | Purpose |
|---|---|
| `config_key` | Stable identifier the calculators look up |
| `group_name` | UI grouping (company, tax_year, income_tax, eobi, …) |
| `label`, `description` | What the operator reads |
| `value_type` | `percent` \| `currency` \| `number` \| `date` \| `text` \| `boolean` \| `json` |
| `value` | **NULL until the operator sets it** |
| `required` | A NULL here is what makes the agent refuse |
| `effective_from` / `effective_to` | Versioning — see below |

**Groups:** company · tax year · income tax · minimum tax · advance tax · salary
withholding · vendor withholding · EOBI · PESSI/SESSI · WWF/WPPF · sales tax ·
SECP · filing deadlines.

**Versioning.** A Finance Act change is a *new row* with a later
`effective_from`, never an edit. `loadConfig(env, asOf)` returns the
configuration in force on a date, so a document generated last year stays
explainable by the rate that applied when it was made. `(config_key,
effective_from)` is unique.

**What ships preset, and what does not.** 28 variables carry the figures the
original reference material stated plainly. The other 20 ship NULL because that
material gave only a range, an endpoint, or an explicit "not confirmed":

- the salary slab table — endpoints only, no intermediate brackets
- vendor withholding — ranges only (4–15% filer / 8–30% non-filer)
- the EOBI notified minimum wage — percentages known, the base not
- every PESSI/SESSI figure — the source declined to confirm them
- provincial sales tax rates, and both thresholds marked approximate

Shipping a plausible default for any of these would be indistinguishable, to the
operator, from a real rate. That is precisely the confusion worth preventing.

**Validation** happens at the write boundary (`PUT /api/agent/config`), not at
render time: a percentage outside 0–100, a date that is not `MM-DD`, malformed
JSON. A bad value that reaches the table is a figure the agent will read out as
fact.

---

## SECTION C — Database

Everything lives in **`office-db`**, not a dedicated D1.

> *Departure from the original spec, which called for a separate database.* D1
> cannot join across databases, and almost every useful question spans both
> sides — "which invoices does this filing cover" would become two round trips
> and a manual join in the Worker. The agent's records sit beside the accounting
> data they describe.

| Table | Holds |
|---|---|
| `compliance_config` | The operator's 48 variables (Section B) |
| `compliance_events` | The compliance calendar, one row per obligation *instance* |
| `generated_documents` | Deliverable metadata; `(doc_type, period_label, version)` unique so a regeneration cannot silently overwrite |
| `agent_conversations` | Renamed from the spec's `conversations` — a bare name would read as CRM's in a shared database |
| `conversation_turns` | The queryable audit trail |
| `notifications_log` | Sent notifications |
| `agent_approvals` | Human-in-the-loop gate (Section E) |

`compliance_events` stores instances rather than rules deliberately: a recurring
obligation is expanded into twelve rows a year by a generator, so the agent never
does date arithmetic about a filing deadline.

---

## SECTION D — Tools

Every tool is a **named, fixed path through the Worker's own API**. A call
travels back over the origin with the internal actor header and passes
`authMiddleware → requireAppAccess → requireFeatureAccess` exactly as a browser
request does.

**The agent can never reach anything the person it acts for could not.** That is
a property of the transport, not a promise in the prompt.

> **`query_d1` is not built, and should not be.** The original spec listed an
> arbitrary-SQL tool. SECURITY.md rules it out: D1 has no read-only role or
> per-table grants, so such a tool would expose `users_logins`, `api_keys`,
> `payroll_records` and `employees.cnic` in full — and prompt injection inside
> any free-text field, an invoice description say, would become a database read.
> The named tools below cover the same ground safely.

### HR

`get_employees` · `get_salary_structure` · `preview_salary_calculation` ·
`build_compliant_salary_components` · `set_salary_structure`† ·
`generate_payroll`† · `get_payroll` · `get_attendance` · `get_loans`

### Accounting

`get_ledgers` · `get_accounts` · `create_ledger`† · `create_account`† ·
`get_journals` · `create_journal_entry`† · `get_transactions` ·
`record_transaction`† · `get_trial_balance` · `get_invoices`

### Configuration and deliverables

`get_compliance_config` · `save_finance_document` · `get_finance_documents`

† requires approval.

### How a compliant salary schema is actually built

This is the mechanism the whole compliance story rests on, and it is worth
stating precisely because it is not obvious:

`POST /api/hr/payroll/generate` computes gross and net from a salary structure's
**components** — `Earning`/`Deduction`, `Fixed`/`Percentage` — plus active
loans. It identifies withholding by looking for `tax` in a component name.

So the agent does not "apply a tax rate" to payroll. It builds the components:

1. `build_compliant_salary_components(annual_gross, employee_count)` reads the
   configuration and returns the statutory deductions, or a refusal naming the
   missing setting.
2. `set_salary_structure` writes them (with approval).
3. `generate_payroll` runs the existing engine over them (with approval).

The component named `Income Tax Withholding` is named that way on purpose — it
is what the payroll route recognises.

**The calculators refuse rather than approximate:**

- no slab table configured → no figure
- income above the top configured bracket → *"the table stops at X"*, never
  extrapolation
- a gap between brackets → reported as a gap
- EOBI assessed on the **notified minimum wage**, never actual salary — using
  real salary would silently overstate every employee's deduction
- PESSI/SESSI has no fallback at all

---

## SECTION E — Human-in-the-loop

Some actions must not happen because a model decided they should: opening an
account, linking a ledger, setting someone's salary, running payroll, posting a
journal, recording a transaction.

The gate is **the `agent_approvals` table, not a sentence in the prompt**. A
prompt instruction is text, and text can be argued with by other text —
including text the agent read out of an invoice description. A missing row
cannot be argued with.

1. The agent calls a gated tool. No token → a row is created and the tool
   returns `approval_required` with an id. It does **not** act.
2. The operator sees it in the approvals inbox with the exact payload, and
   approves or rejects.
3. The agent retries with the token. The payload is **hashed and re-checked**,
   so an approval for one thing cannot be replayed against another.

Approvals are single-use and expire after an hour — a stale "yes" should not
still authorise tomorrow.

---

## SECTION F — Access control

Two independent layers:

**Entry.** Reaching the agent requires `agent/reports` at edit. Driving it can
change the books once an approval is granted, so it is not a read-level
capability, and it is not implied by holding an officeOS account. Enforced by
middleware on `POST /api/agent/chat`, and explicitly in the Slack path — a Slack
message never passes through Hono carrying the actor's identity, so that check
is written out rather than assumed.

**Reach.** Every tool call travels back through the Worker as the acting user.
An operator who cannot see payroll cannot use the agent to see payroll.

Editing the rates the agent quotes is separated from using it: `agent/config`
versus `agent/reports`.

Verified: superadmin 200, a Tech Lead without the grant 403, unauthenticated 401.

---

## SECTION G — Runtime

`PleiadesAgent extends Agent<Env>` — an Agents-SDK Durable Object, one instance
per conversation. Serialising turns matters more here than for a chat assistant:
bookkeeping is consequential, and two concurrent requests must not race into
posting the same journal twice.

- Conversation history → D1, so it is queryable by the operator and their
  accountant. `this.sql` is private to the instance and not an audit trail.
- Compliance context is rebuilt **every turn**, never cached — the operator may
  have corrected a rate seconds ago.
- Temperature 0.1. This is bookkeeping, not brainstorming.

> **On the LLM stack.** The turn loop uses `nova-agent-framework`, as the Slack
> agent does. `agents@0.21.0` peers `zod@^4` while that framework needs `zod@^3`;
> the SDK's core entry uses no zod itself, so it is installed against the MCP
> peers with `--legacy-peer-deps` and root zod stays at v3. When this agent needs
> `AIChatAgent` or MCP, that is the moment to drop `nova-agent-framework` and
> move wholesale to zod v4 — deliberately, not by accident.

---

## SECTION H — Interfaces

**Accounting UI** (`/accountant`) — three tabs, because they are one job:

- **Chat** — drive the agent
- **Compliance settings** — all 48 variables by group and type, with a warning
  banner naming unset required ones, and a **preview of the exact prompt block
  the agent will read**, so settings can be verified rather than trusted
- **Approvals** — the inbox, showing each pending payload in full

**Slack** — the existing agent, with the accountant behind the same entry check.

---

## What is left

Honestly stated, in the order worth doing:

1. **Fill in the 17 required-unset variables.** Nothing numeric works without
   them, and the salary slab table blocks every payroll schema. This is
   operator work, not engineering.
2. **Statement rendering.** `save_finance_document` files metadata; nothing yet
   produces the formatted XLSX/PDF. Needs a template per deliverable, R2 upload
   under `finance-docs/`, and the `GAL_<DocType>_<Period>_v<n>` naming with the
   DRAFT header and provenance annex.
3. **The compliance calendar generator.** `compliance_events` exists and is
   empty; the expansion of recurring rules into dated instances is not written.
4. **Scheduled sweeps.** `this.schedule()` is available and unused. The daily
   "what is due in 14 days" pass depends on 3.
5. **Notifications.** `notifications_log` exists; no email or Slack delivery of
   deliverables is wired.
6. **Vectorize / `knowledge_search`.** Not built. Deliberately deferred: with
   configuration as the source of rates, RAG over a compliance corpus is a
   research aid, not a dependency — and it was the part most likely to produce
   confident, wrong citations.

## Dropped from the original spec

| Dropped | Why |
|---|---|
| `query_d1` | Unsafe by SECURITY.md; named tools cover it |
| Dedicated D1 | Cannot join across databases |
| `submit_to_authority_portal` | Draft-never-file; a stub that refuses is just a tool that shouldn't exist |
| Rates in the system prompt | Replaced by operator configuration — a prompt with numbers is a second source of truth nobody updates |
| Seeded `calc_config` JSON blobs | Unmaintainable in a form; replaced by typed per-variable rows |
