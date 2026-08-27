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
`get_journals` · `get_ledger_view` · `create_journal_entry`† ·
`get_transactions` · `record_transaction`† · `get_trial_balance` ·
`get_invoices`

Reads take date ranges. `get_journals` and `get_accounts` accept
`start_date`/`end_date`, and `get_accounts` then reports opening balance, period
movement and closing balance per account — the period-delta view. The trial
balance is cumulative-to-date and cannot express a period, so it is the wrong
tool for any question about a month. `get_ledger_view` is the T-account for one
account, and `get_ledgers(with_accounts)` joins accounts onto their ledgers and
separately reports accounts belonging to none.

### Assets

`get_assets` · `get_depreciation_schedule` · `post_depreciation`†

The register carries cost, purchase date, salvage, useful life, class, serial,
vendor and the two accounts depreciation posts to. Straight-line, monthly, from
the month after purchase, stopped at disposal, never below salvage. Posting
writes one balanced compound journal for the whole register — debit
depreciation expense, credit accumulated depreciation — and names any asset it
could not post rather than posting it to a default. The arithmetic is a pure
function shared with the statement generator, because a figure those two
disagreed on would be a reconciliation failure nobody could explain.

### Statements

`generate_statement` · `list_statements`

Renders a profit and loss account for a date range, or a statement of assets and
liabilities as at a date, as a PDF into `finance-docs/`. **Not approval-gated:**
it reads the ledger and writes a draft, and changes no books. That is what lets
the scheduled run have the month's statement ready to download rather than
merely suggesting one.

### Configuration, knowledge and memory

`get_compliance_config` · `knowledge_search` · `recall_actions` ·
`record_action` · `save_finance_document` · `get_finance_documents`

`recall_actions` takes `since`/`until` as well as a query, and returns the
`entities` an action touched — recalling *that* something was filed without
recalling *what* leaves the next question unanswerable.

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
2. The operator sees the exact payload — inline under the reply that raised it,
   and in the approvals inbox — and approves or rejects.
3. **Approving carries the action out.** The stored payload runs immediately,
   and the result is recorded on the row.

The third step used to require the agent to call the same tool again with a
byte-identical payload plus the token, checked by SHA-256. That could never
succeed: the agent had no conversation memory, so it could neither recall the id
nor reproduce the payload, and any re-derived amount or re-ordered `lines` array
changed the hash. The UI was reduced to asking the human to paste `apr_…` into
the chat. This was a design error, not a tuning problem.

Two properties of the fix are worth stating:

- **The work has one implementation.** Both the tool path and the approval path
  invoke the same executor registry, so the thing approved and the thing
  executed cannot drift apart.
- **Execution runs as the requester, never the approver.** Approval is
  authorisation, not impersonation; the audit trail must name the person the
  agent was acting for.

A run that fails leaves the row `approved` with `execution_status = 'failed'`
rather than silently `consumed`, so it can be retried instead of burnt. The
token path still works for the agent, and approvals remain single-use and expire
after an hour — a stale "yes" should not still authorise tomorrow.

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
- **The last ~8 turns are replayed to the model each turn.** They were being
  written and never read back: nothing in the repo SELECTed `conversation_turns`.
  The Durable Object was giving serialisation, not memory. Tool rows and
  `[error]` entries are skipped — replaying either invites the model to treat
  its own bookkeeping as instruction.
- Long-term memory is the agent journal: consequential actions written to D1 for
  exact recall and embedded into Vectorize under the `history` namespace for
  associative recall. An exact filter is answered exactly, never by similarity.

  **What gets journalled is decided in code, not by the model.** Approval-gated
  actions are recorded by the gate; `generate_statement`,
  `save_finance_document` and `build_compliant_salary_components` are wrapped in
  `recorded()`, which journals the outcome — including failures and refusals,
  since "why was August's withholding nil" is answered by the attempt that named
  the unset setting. Reads are deliberately not journalled: indexing every
  `get_accounts` would bury the entries that matter. `record_action` remains, for
  reasoning the tool layer cannot infer.

  **The index holds one year; the record is kept for ever.** A daily sweep drops
  journal vectors older than 365 days and clears their `vector_id`, leaving the
  row untouched — dated recall still reaches everything ever written. Similarity
  search over years of routine bookkeeping surfaces the merely similar ahead of
  the recent and relevant, and a company's books are not something to forget
  after twelve months.
- Compliance context is rebuilt **every turn**, never cached — the operator may
  have corrected a rate seconds ago.
- Temperature 0.1. This is bookkeeping, not brainstorming.

> **On the LLM stack.** The turn loop is the Vercel AI SDK (`generateText` with
> `stopWhen: stepCountIs(12)`) over **Workers AI**, model
> `@cf/openai/gpt-oss-120b`, reached through the `AI` binding.
>
> `nova-agent-framework` is gone. It pinned the project to zod v3, which the
> Agents SDK's own surface could not use; dropping it moved everything to zod v4
> and, more importantly, means tool schemas are real JSON Schema derived from
> zod rather than a description the model has to interpret.
>
> Workers AI over the binding rather than a third-party gateway: no per-provider
> quota to run into halfway through a payroll run — which is exactly what
> happened on the previous stack — no gateway token to rotate, and the model runs
> on the same platform as the data.

---

## SECTION H — Interfaces

**Accounting UI** — tabs inside Accounting, not an app of its own:

- **Chat** — drive the agent
- **Compliance settings** — all 48 variables by group and type, with a warning
  banner naming unset required ones, and a **preview of the exact prompt block
  the agent will read**, so settings can be verified rather than trusted
- **Approvals** — the inbox, showing each pending payload in full. Approvals
  also appear inline in the chat, under the reply that raised them: with
  approving now executing, there is no id to copy anywhere.
- **Assets** — the register, with a depreciation run previewed before it posts
- **Statements** — generate a P&L or a wealth statement, and download either

**Slack** — the existing agent, with the accountant behind the same entry check.

**Scheduled** — a cron at 06:00 and 17:00 UTC. The morning asks what is due; the
evening asks what is still outstanding. It runs as the account named in
`daily_runner_actor`, so its tool calls are bounded by a real person's grants
exactly as an interactive turn is. That setting ships unset and the runner
refuses rather than choosing someone: deciding whose authority an unattended job
acts under is a question about trust, not one for code to guess. Output goes to
`app_messages` for the finance app and to the agent journal, so a suggestion
survives nobody being logged in. It proposes; anything touching the ledger still
raises an approval.

---

## What is left

Honestly stated, in the order worth doing:

1. **Fill in the required-unset variables.** Nothing numeric works without them,
   and the salary slab table blocks every payroll schema. This is operator work,
   not engineering. `daily_runner_actor` belongs in the same pass: until it is
   set, the scheduled run declines to act.
2. **Upload the compliance manual.** `knowledge_search` and the ingestion
   pipeline are built and the bucket is wired; the corpus is what is missing.
3. **The compliance calendar generator.** `compliance_events` exists and is
   empty. The expansion of recurring rules into dated instances is not written,
   so the scheduled run reasons from the manual and the configured deadlines
   rather than from a calendar of concrete obligations.
4. **Notifications.** `notifications_log` exists; the scheduled check writes to
   `app_messages`, but no email or Slack delivery of deliverables is wired.
5. **More statements.** Profit and loss and assets-and-liabilities are built. A
   cash-flow statement and the statutory return formats are not.
6. **Declining-balance depreciation.** Only straight-line is implemented;
   `depreciation_method` is stored so the choice is recorded, and anything other
   than `straight_line` is currently refused rather than approximated.

## Dropped from the original spec

| Dropped | Why |
|---|---|
| `query_d1` | Unsafe by SECURITY.md; named tools cover it |
| Dedicated D1 | Cannot join across databases |
| `submit_to_authority_portal` | Draft-never-file; a stub that refuses is just a tool that shouldn't exist |
| Rates in the system prompt | Replaced by operator configuration — a prompt with numbers is a second source of truth nobody updates |
| Seeded `calc_config` JSON blobs | Unmaintainable in a form; replaced by typed per-variable rows |
