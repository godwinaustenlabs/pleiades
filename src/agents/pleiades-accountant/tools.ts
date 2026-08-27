import { z } from 'zod';
import { tool } from 'ai';
import { Env } from '../../index';
import { buildStatutoryComponents } from './compliance';
import { loadConfig, missingRequired } from './config';
import { requestApproval, consumeApproval } from './approvals';
import { buildExecutors } from './executors';
import { searchKnowledge } from './knowledge';
import { recordAction, recallActions } from './journal';

/** Calls the Worker's own API as the acting user. */
export type ApiCaller = (method: string, path: string, body?: unknown) => Promise<string>;

export interface ToolContext {
  env: Env;
  /** users_logins.id the agent is acting as. Every call inherits their grants. */
  actorUserId: string;
  callApi: ApiCaller;
}

/**
 * The accountant agent's tools.
 *
 * Three rules hold across all of them:
 *
 * 1. **No arbitrary SQL.** Every tool is a named, fixed path through the
 *    Worker's own API, so a call passes authMiddleware → requireAppAccess →
 *    requireFeatureAccess exactly as a browser request does. The agent
 *    therefore cannot read or write anything the person it is acting for
 *    could not. A `query_d1`-style tool would bypass all of that and turn any
 *    free-text field — an invoice description, say — into a potential database
 *    read, which is why there isn't one.
 *
 * 2. **Compliance figures come from configuration.** Anything that produces a
 *    tax or contribution amount reads compliance_config and refuses when a
 *    needed value is unset. Nothing here carries a rate of its own.
 *
 * 3. **Consequential actions need a human.** Opening an account, linking a
 *    ledger, running payroll, posting a journal — these create an approval
 *    request and stop. The gate is this code, not a sentence in the prompt.
 */
export const buildPleiadesTools = (ctx: ToolContext) => {
  const { callApi } = ctx;

  // The same map the approvals route runs on approval, so the thing approved
  // and the thing executed can never drift apart.
  const executors = buildExecutors(callApi);

  /** Wraps a gated action: request approval, or execute the approved payload. */
  /**
   * Wraps a consequential action behind the approval gate.
   *
   * The work itself comes from `executors[toolName]`, not from a closure passed
   * in here, so the payload the operator approves and the payload the agent
   * runs go through the very same function. As two implementations they could
   * diverge silently, and only the approved path would be wrong.
   */
  const gated = (toolName: string, summarise: (args: any) => string) => async (args: any) => {
    const { approvalToken, ...payload } = args ?? {};

    if (!approvalToken) {
      const req = await requestApproval(ctx, toolName, payload, summarise(payload));
      return JSON.stringify({
        status: 'approval_required',
        approvalId: req.id,
        summary: req.summary,
        message:
          'Waiting on the operator. Tell them plainly what will change and stop — do not retry. ' +
          'When they approve it in the Accounting view it runs on its own; you do not need to ' +
          'call this again.',
      });
    }

    const check = await consumeApproval(ctx, approvalToken, toolName, payload);
    if (!check.ok) return JSON.stringify({ status: 'refused', reason: check.reason });

    const executor = executors[toolName];
    if (!executor) return JSON.stringify({ status: 'refused', reason: `No executor for ${toolName}.` });
    return executor(payload);
  };

  /**
   * Wraps a consequential tool that needs no approval, and journals what it did.
   *
   * The same argument as the approval gate, one step down: an action the
   * business will be asked about later must not go unrecorded because the model
   * did not think to call `record_action`. Generating a statement or filing a
   * document produces something a person will hold in their hand — "which
   * figures were in the August P&L, and when was it produced" has to be
   * answerable from the record, not from the model's recollection.
   *
   * Reads are deliberately NOT wrapped. Indexing every `get_accounts` would
   * bury the handful of entries that matter under thousands that do not, and a
   * semantic index whose signal is drowned is worse than a smaller one.
   *
   * Failures are journalled too, as `blocked`. "Why is there no August
   * statement" is answered by the attempt that failed, not by silence.
   */
  const recorded = (
    toolName: string,
    describe: (
      args: any,
      parsed: any,
    ) => { subject: string; summary: string; periodLabel?: string; entities?: Record<string, unknown> },
    execute: (args: any) => Promise<string>,
  ) => async (args: any) => {
    const result = await execute(args);

    try {
      let parsed: any = null;
      try { parsed = JSON.parse(result); } catch { /* a non-JSON body is not a failure */ }
      // The API answers 200 with { success: false } for a refused write, so a
      // thrown error is not the only way this ends badly.
      const failed = parsed?.success === false;
      const d = describe(args, parsed?.data ?? parsed);

      await recordAction(ctx.env, {
        actionType: toolName,
        subject: d.subject,
        summary: failed ? `Attempted, and failed: ${String(parsed?.error ?? '').slice(0, 300)}` : d.summary,
        periodLabel: d.periodLabel,
        entities: d.entities,
        outcome: failed ? 'blocked' : 'completed',
        actorUserId: ctx.actorUserId,
        source: 'agent',
      });
    } catch (err) {
      // Never fail the action because the note about it failed.
      console.error(`[tools] journalling ${toolName} failed:`, err);
    }

    return result;
  };

  return {
    get_compliance_config: tool({
      description: 'The operator-configured compliance settings: tax year, rates, thresholds, deadlines, ' +
                'company registration details. This is the only source of rates. Check it before quoting any figure.',
      inputSchema: z.object({}),
      execute: async () => {
              const vars = await loadConfig(ctx.env);
              const missing = missingRequired(vars);
              return JSON.stringify({
                settings: vars.map((v) => ({ key: v.key, label: v.label, value: v.value, unit: v.unit, group: v.group })),
                unconfiguredRequired: missing.map((v) => ({ key: v.key, label: v.label })),
                note: missing.length
                  ? 'Some required settings are unset. Anything depending on them cannot be computed — say so instead.'
                  : 'All required settings are configured.',
              });
            },
    }),

    knowledge_search: tool({
      description:
        'Searches everything indexed — the compliance documents AND your own past actions — for rules, ' +
        'procedures, formats, worked examples and precedent. Use it to understand HOW something must be ' +
        'done, or whether you have handled something like it before. Each passage is labelled with its ' +
        'kind: "reference" is the manual, "own-note" is something you wrote yourself. A note is a record ' +
        'of what you did, never authority for what is correct — do not cite one as a rule. Neither is a ' +
        'source of rates: every number comes from get_compliance_config. If a passage states a figure ' +
        'that contradicts the configured value, report the discrepancy rather than choosing.',
      inputSchema: z.object({
                query: z.string().describe('What you need to understand'),
                top_k: z.number().optional().describe('How many passages, default 5'),
              }),
      execute: async (a: any) => {
              const result = await searchKnowledge(ctx.env, a.query, { topK: a.top_k });
              return JSON.stringify({
                passages: result.passages.map((p) => ({
                  // The search spans both namespaces on purpose — the manual and
                  // the agent's own history are both useful context. Saying which
                  // is which is what stops the agent citing its own past note back
                  // as though it were the rule it was following.
                  kind:
                    p.namespace === 'history'
                      ? 'own-note'
                      : p.namespace === 'compliance'
                        ? 'reference'
                        : 'unlabelled',
                  source: `${p.title} › ${p.section}`,
                  relevance: Math.round(p.score * 100) / 100,
                  text: p.text,
                })),
                authority: result.note,
              });
            },
    }),

    record_action: tool({
      description: 'Writes what you did and WHY into your working journal, so a later conversation can ' +
                'recover the reasoning. Record anything consequential or anything a person would later ' +
                'ask you to justify — a statement produced (including a nil one, with the reason it was ' +
                'nil), a structure set, an entry posted, or a refusal and what blocked it. Consequential ' +
                'approved actions are journalled for you automatically; this is for the reasoning behind ' +
                'them, and for everything else.',
      inputSchema: z.object({
                action_type: z
                  .string()
                  .describe('e.g. statement_generated, payroll_generated, account_created, refused'),
                subject: z.string().describe('What was acted on, in human terms'),
                summary: z.string().describe('What you did'),
                rationale: z.string().optional().describe('Why — including why a figure was nil'),
                period_label: z.string().optional().describe("e.g. '2026-08' or 'TY2027'"),
                outcome: z.enum(['completed', 'refused', 'blocked']).optional(),
                entities: z.record(z.string(), z.any()).optional().describe('Related record ids'),
              }),
      execute: async (a: any) => {
              const res = await recordAction(ctx.env, {
                actionType: a.action_type,
                subject: a.subject,
                summary: a.summary,
                rationale: a.rationale,
                periodLabel: a.period_label,
                outcome: a.outcome,
                entities: a.entities,
                actorUserId: ctx.actorUserId,
                source: 'agent',
              });
              return JSON.stringify({
                recorded: true,
                id: res.id,
                recallable: res.embedded,
                note: res.embedded
                  ? 'Recorded and indexed for recall.'
                  : 'Recorded. Semantic recall is unavailable, but it is in the dated journal.',
              });
            },
    }),

    recall_actions: tool({
      description: 'Looks up what you did before and why. Give a query to search by meaning, or filters ' +
                '(action_type, period_label) for an exact answer. Check this before repeating work or ' +
                'when asked why something was done a particular way — the reasoning is recorded, so do ' +
                'not reconstruct it from memory.',
      inputSchema: z.object({
                query: z.string().optional().describe('What you are trying to remember'),
                action_type: z.string().optional(),
                period_label: z.string().optional().describe("e.g. '2026-08'"),
                since: z.string().optional().describe('YYYY-MM-DD, inclusive'),
                until: z.string().optional().describe('YYYY-MM-DD, inclusive'),
                limit: z.number().optional(),
              }),
      execute: async (a: any) => {
              const res = await recallActions(ctx.env, {
                query: a.query,
                actionType: a.action_type,
                periodLabel: a.period_label,
                since: a.since ? new Date(`${a.since}T00:00:00Z`) : undefined,
                until: a.until ? new Date(`${a.until}T23:59:59Z`) : undefined,
                limit: a.limit,
              });
              return JSON.stringify({
                mode: res.mode,
                entries: res.entries,
                note:
                  res.entries.length === 0
                    ? 'Nothing recorded matches. Say so rather than assuming it was not done.'
                    : 'These are your own past actions and reasons, not the compliance manual.',
              });
            },
    }),

    get_employees: tool({
      description: 'Employee records. Filter by department, or pass employee_id for one.',
      inputSchema: z.object({
                employee_id: z.string().optional().describe('Internal employee id (emp_...)'),
                department: z.string().optional(),
              }),
      execute: async (a: any) => {
              if (a.employee_id) return callApi('GET', `/api/core/employees/${a.employee_id}`);
              const qs = a.department ? `?department=${encodeURIComponent(a.department)}` : '';
              return callApi('GET', `/api/core/employees${qs}`);
            },
    }),

    get_salary_structure: tool({
      description: "An employee's active salary structure and its components.",
      inputSchema: z.object({ employee_id: z.string() }),
      execute: async (a: any) => callApi('GET', `/api/hr/salary-structures/${a.employee_id}/active`),
    }),

    preview_salary_calculation: tool({
      description: 'What the payroll engine would compute for an employee from their current structure.',
      inputSchema: z.object({ employee_id: z.string() }),
      execute: async (a: any) => callApi('GET', `/api/hr/salary-structures/${a.employee_id}/calculate`),
    }),

    build_compliant_salary_components: tool({
      description: 'Computes the statutory deduction components (income tax withholding, EOBI, optionally PESSI/SESSI) ' +
                'for an annual gross, strictly from the configured rates. Returns a refusal naming the missing ' +
                'setting if any required figure is unconfigured. Use this before setting any salary structure — ' +
                'never work the deductions out yourself.',
      inputSchema: z.object({
                annual_gross: z.number().describe('Annual gross salary in PKR'),
                employee_count: z.number().describe('Total active employees — decides whether EOBI applies'),
                include_eobi: z.boolean().optional(),
                include_pessi: z.boolean().optional(),
              }),
      // Journalled because its *refusals* are the record worth keeping. "Why
      // was August's withholding nil" is answered by the attempt that named the
      // unset setting, and that answer is worthless if it was never written
      // down. The successes are recorded for the same reason: they are the
      // basis of somebody's actual pay.
      execute: recorded(
        'build_compliant_salary_components',
        (a, parsed) => ({
          subject: `Statutory components for annual gross ${a.annual_gross}`,
          summary: parsed?.ok === false
            ? `Refused: ${parsed.reason ?? 'a required setting is unset'}.`
            : `Built ${parsed?.components?.length ?? 0} component(s). Basis: ` +
              `${(parsed?.basis ?? []).join('; ') || 'not stated'}.`,
          entities: {
            annualGross: a.annual_gross,
            employeeCount: a.employee_count,
            components: parsed?.components,
            refused: parsed?.ok === false || undefined,
          },
        }),
        async (a: any) => {
          const result = await buildStatutoryComponents(ctx.env, {
            annualGross: a.annual_gross,
            employeeCount: a.employee_count,
            includeEobi: a.include_eobi,
            includePessi: a.include_pessi,
          });
          return JSON.stringify(result);
        },
      ),
    }),

    set_salary_structure: tool({
      description: "Replaces an employee's salary structure. Components must come from " +
                'build_compliant_salary_components — do not hand-write deduction amounts. Needs approval.',
      inputSchema: z.object({
                employee_id: z.string(),
                base_salary: z.number(),
                effective_date: z.string().describe('YYYY-MM-DD'),
                components: z.array(
                  z.object({
                    componentName: z.string(),
                    componentType: z.enum(['Earning', 'Deduction']),
                    amountType: z.enum(['Fixed', 'Percentage']),
                    value: z.number(),
                  }),
                ),
                approvalToken: z.string().optional(),
              }),
      execute: gated('set_salary_structure', (p) =>
                `Replace the salary structure for ${p.employee_id}: base ${p.base_salary}, ` +
                `${p.components?.length ?? 0} component(s), effective ${p.effective_date}.`),
    }),

    generate_payroll: tool({
      description: 'Runs payroll for every active employee for a month. Consequential and organisation-wide, so it needs approval.',
      inputSchema: z.object({
                month: z.string().describe('YYYY-MM'),
                approvalToken: z.string().optional(),
              }),
      execute: gated('generate_payroll', (p) => `Generate payroll for ALL active employees for ${p.month}.`),
    }),

    generate_statement: tool({
      description:
        'Renders a formatted accounting statement as a PDF and files it under finance-docs/, returning a ' +
        'download link. Types: profit_and_loss (needs start_date and end_date) and assets_and_liabilities ' +
        '(a wealth statement, as at end_date). The figures come from the ledger, not from you — say what ' +
        'the statement reports, do not restate it from memory. This changes no books, so it needs no approval.',
      inputSchema: z.object({
        type: z.enum(['profit_and_loss', 'assets_and_liabilities']),
        start_date: z.string().optional().describe('YYYY-MM-DD; required for profit_and_loss'),
        end_date: z.string().describe('YYYY-MM-DD'),
      }),
      execute: recorded(
        'generate_statement',
        (a, data) => ({
          subject: `${a.type === 'profit_and_loss' ? 'Profit and loss' : 'Assets and liabilities'} statement`,
          summary:
            `Generated version ${data?.version ?? '?'} covering ` +
            `${a.start_date ? `${a.start_date} to ` : 'as at '}${a.end_date}` +
            (data?.figures ? `. Figures: ${JSON.stringify(data.figures)}` : '') +
            '.',
          // The period the statement *reports on*, not the day it was made —
          // "what did we produce for August" is the question that gets asked.
          periodLabel: (a.start_date ?? a.end_date).slice(0, 7),
          entities: {
            docId: data?.docId,
            version: data?.version,
            url: data?.url,
            startDate: a.start_date ?? null,
            endDate: a.end_date,
            figures: data?.figures,
          },
        }),
        (a: any) =>
          callApi('POST', '/api/finance/statements', {
            type: a.type,
            startDate: a.start_date,
            endDate: a.end_date,
          }),
      ),
    }),

    list_statements: tool({
      description:
        'Statements that exist and can be downloaded, newest first, with the figures each one ' +
        'reported. Reconciled against the document store, so anything whose file has been removed ' +
        'is absent — if a period you expected is not here, its statement is gone and generating it ' +
        'again is the right move. `missing` counts records whose file no longer exists.',
      inputSchema: z.object({}),
      execute: async () => callApi('GET', '/api/finance/statements'),
    }),

    get_assets: tool({
      description:
        'The asset register: what the company owns, what it cost, what has been depreciated and what it is ' +
        'currently worth. Use this for anything about equipment, buildings, vehicles or written-down value.',
      inputSchema: z.object({
        assetClass: z.string().optional().describe('laptop | furniture | building | vehicle | equipment | stationery | other'),
        assignedTo: z.string().optional().describe('employee id'),
        asOf: z.string().optional().describe('YYYY-MM-DD; defaults to today'),
      }),
      execute: async (a: any) => {
        const q = new URLSearchParams();
        if (a.assetClass) q.set('assetClass', a.assetClass);
        if (a.assignedTo) q.set('assignedTo', a.assignedTo);
        if (a.asOf) q.set('asOf', a.asOf);
        return callApi('GET', `/api/finance/assets${q.toString() ? `?${q}` : ''}`);
      },
    }),

    get_depreciation_schedule: tool({
      description:
        'What a depreciation run would charge for a month, per asset, WITHOUT posting anything. ' +
        'Read this before proposing to post — it names assets that cannot be posted because no ' +
        'depreciation accounts are set.',
      inputSchema: z.object({ period: z.string().describe('YYYY-MM') }),
      execute: async (a: any) =>
        callApi('GET', `/api/finance/assets/depreciation?period=${encodeURIComponent(a.period)}`),
    }),

    post_depreciation: tool({
      description:
        'Posts one month of depreciation to the general journal: debit depreciation expense, credit ' +
        'accumulated depreciation, one balanced compound entry across the whole register. Changes the ' +
        'books, so it needs approval. A period already posted is skipped rather than charged twice.',
      inputSchema: z.object({
        period: z.string().describe('YYYY-MM'),
        approvalToken: z.string().optional(),
      }),
      execute: gated(
        'post_depreciation',
        (p) => `Post depreciation for ${p.period} to the general journal.`,
      ),
    }),

    get_payroll: tool({
      description: 'Payroll records, optionally for one month.',
      inputSchema: z.object({ month: z.string().optional().describe('YYYY-MM') }),
      execute: async (a: any) =>
              callApi('GET', `/api/hr/payroll${a.month ? `?month=${encodeURIComponent(a.month)}` : ''}`),
    }),

    get_attendance: tool({
      description: 'Attendance records, for payroll and statutory reporting.',
      inputSchema: z.object({ employee_id: z.string().optional() }),
      execute: async (a: any) =>
              callApi('GET', `/api/hr/attendance${a.employee_id ? `?employeeId=${a.employee_id}` : ''}`),
    }),

    get_loans: tool({
      description: 'Employee loans — they appear as payroll deductions.',
      inputSchema: z.object({}),
      execute: async () => callApi('GET', '/api/hr/loans'),
    }),

    get_ledgers: tool({
      description:
        'All ledgers. With with_accounts, each ledger carries the accounts linked to it and their ' +
        'balances, which is usually what "show me the ledgers" actually means.',
      inputSchema: z.object({ with_accounts: z.boolean().optional() }),
      execute: async (a: any) => {
        const ledgers = await callApi('GET', '/api/finance/ledgers');
        if (!a.with_accounts) return ledgers;

        const accounts = await callApi('GET', '/api/finance/accounts');
        try {
          const l = JSON.parse(ledgers)?.data ?? [];
          const acc = JSON.parse(accounts)?.data ?? [];
          return JSON.stringify({
            ledgers: l.map((led: any) => ({
              ...led,
              accounts: acc.filter((x: any) => x.ledgerId === led.id),
            })),
            // Accounts with no ledger are real and would otherwise be invisible
            // in a ledger-shaped view.
            unlinkedAccounts: acc.filter((x: any) => !x.ledgerId),
          });
        } catch {
          // Two valid responses that would not join; better to hand back both
          // than to claim the join failed.
          return JSON.stringify({ ledgers: JSON.parse(ledgers), accounts: JSON.parse(accounts) });
        }
      },
    }),

    get_accounts: tool({
      description:
        'Chart of accounts, or one account by id. With a date range each account also carries its ' +
        'opening balance, the movement in the period and its closing balance — which is what to use ' +
        'for anything about a period rather than the trial balance, which is cumulative to date.',
      inputSchema: z.object({
        account_id: z.string().optional(),
        start_date: z.string().optional().describe('YYYY-MM-DD'),
        end_date: z.string().optional().describe('YYYY-MM-DD'),
      }),
      execute: async (a: any) => {
        if (a.account_id) return callApi('GET', `/api/finance/accounts/${a.account_id}`);
        const q = new URLSearchParams();
        if (a.start_date) q.set('startDate', a.start_date);
        if (a.end_date) q.set('endDate', a.end_date);
        return callApi('GET', `/api/finance/accounts${q.toString() ? `?${q}` : ''}`);
      },
    }),

    create_ledger: tool({
      description: 'Opens a new ledger. A structural change to the books, so it needs approval — never create one to make an entry fit.',
      inputSchema: z.object({
                ledgerName: z.string(),
                description: z.string().optional(),
                approvalToken: z.string().optional(),
              }),
      execute: gated('create_ledger', (p) => `Create a new LEDGER "${p.ledgerName}".`),
    }),

    create_account: tool({
      description: 'Opens a new account, optionally under a ledger. A structural change to the chart of accounts, so it needs approval.',
      inputSchema: z.object({
                accountName: z.string(),
                accountType: z.string().optional().describe('Asset | Liability | Equity | Revenue | Expense'),
                ledgerId: z.string().optional(),
                openingBalance: z.number().optional(),
                approvalToken: z.string().optional(),
              }),
      execute: gated('create_account', (p) =>
                `Create a new ACCOUNT "${p.accountName}"${p.accountType ? ` (${p.accountType})` : ''}` +
                `${p.ledgerId ? ` linked to ledger ${p.ledgerId}` : ' with no ledger link'}.`),
    }),

    get_journals: tool({
      description:
        'General journal entries, optionally for one ledger and one date range. Always pass a range when ' +
        'the question is about a period — reading every entry ever posted and filtering them yourself ' +
        'wastes the context you need for the answer.',
      inputSchema: z.object({
        journal_id: z.string().optional(),
        ledger_id: z.string().optional(),
        start_date: z.string().optional().describe('YYYY-MM-DD, inclusive'),
        end_date: z.string().optional().describe('YYYY-MM-DD, inclusive'),
      }),
      execute: async (a: any) => {
        if (a.journal_id) return callApi('GET', `/api/finance/journals/${a.journal_id}`);
        const q = new URLSearchParams();
        if (a.ledger_id) q.set('ledger_id', a.ledger_id);
        if (a.start_date) q.set('startDate', a.start_date);
        if (a.end_date) q.set('endDate', a.end_date);
        return callApi('GET', `/api/finance/journals${q.toString() ? `?${q}` : ''}`);
      },
    }),

    get_ledger_view: tool({
      description:
        'One account as a T-account: opening balance, every entry against it in the period, and the ' +
        'closing balance. This is how to answer "what happened on this account", rather than reading ' +
        'the whole journal and adding it up yourself.',
      inputSchema: z.object({
        account_id: z.string(),
        start_date: z.string().optional().describe('YYYY-MM-DD'),
        end_date: z.string().optional().describe('YYYY-MM-DD'),
      }),
      execute: async (a: any) => {
        const q = new URLSearchParams({ account_id: a.account_id });
        if (a.start_date) q.set('startDate', a.start_date);
        if (a.end_date) q.set('endDate', a.end_date);
        return callApi('GET', `/api/finance/ledger-view?${q}`);
      },
    }),

    create_journal_entry: tool({
      description: 'Posts a compound double-entry journal. Debits must equal credits — the server rejects it otherwise. Needs approval.',
      inputSchema: z.object({
                entryDate: z.string().describe('YYYY-MM-DD'),
                narration: z.string().describe('What the entry records'),
                lines: z
                  .array(
                    z.object({
                      accountId: z.string(),
                      type: z.enum(['debit', 'credit']),
                      amount: z.number(),
                    }),
                  )
                  .describe('At least one debit and one credit, totals equal'),
                approvalToken: z.string().optional(),
              }),
      execute: gated('create_journal_entry', (p) => {
                const dr = (p.lines || []).filter((l: any) => l.type === 'debit').reduce((s: number, l: any) => s + l.amount, 0);
                return `Post a journal for ${p.entryDate} — "${p.narration}", ${p.lines?.length ?? 0} lines, ${dr} each side.`;
              }),
    }),

    get_transactions: tool({
      description: 'Financial transactions.',
      inputSchema: z.object({ transaction_id: z.string().optional() }),
      execute: async (a: any) =>
              callApi('GET', a.transaction_id ? `/api/finance/transactions/${a.transaction_id}` : '/api/finance/transactions'),
    }),

    record_transaction: tool({
      description: 'Records a financial transaction. Needs approval — it moves the books.',
      inputSchema: z.object({
                accountId: z.string().optional(),
                amount: z.number(),
                transactionType: z.string().optional(),
                description: z.string().optional(),
                transactionDate: z.string().optional().describe('YYYY-MM-DD'),
                approvalToken: z.string().optional(),
              }),
      execute: gated('record_transaction', (p) => `Record a transaction of ${p.amount}${p.description ? ` — "${p.description}"` : ''}.`),
    }),

    get_trial_balance: tool({
      description: 'The trial balance — the basis for most statements.',
      inputSchema: z.object({}),
      execute: async () => callApi('GET', '/api/finance/trial-balance'),
    }),

    get_invoices: tool({
      description: 'Invoices, for revenue and withholding workings.',
      inputSchema: z.object({ status: z.enum(['paid', 'unpaid', 'all']).optional() }),
      execute: async (a: any) =>
              callApi('GET', `/api/finance/invoices${a.status && a.status !== 'all' ? `?status=${a.status}` : ''}`),
    }),

    save_finance_document: tool({
      description: 'Files a generated statement in the accounting document store. Call this after uploading the ' +
                'rendered file, so the deliverable is findable where the accountant already looks.',
      inputSchema: z.object({
                title: z.string(),
                documentType: z.string().describe('e.g. Statement, Return, Reconciliation'),
                url: z.string().describe('R2 path under finance-docs/'),
              }),
      execute: recorded(
        'save_finance_document',
        (a, data) => ({
          subject: `Filed: ${a.title}`,
          summary: `Filed a ${a.documentType} in the accounting document store at ${a.url}.`,
          entities: { documentId: data?.id, title: a.title, documentType: a.documentType, url: a.url },
        }),
        (a: any) =>
          callApi('POST', '/api/finance/documents', {
            title: a.title,
            documentType: a.documentType,
            url: a.url,
          }),
      ),
    }),

    get_finance_documents: tool({
      description: 'Documents already filed in accounting.',
      inputSchema: z.object({}),
      execute: async () => callApi('GET', '/api/finance/documents'),
    }),
  };
};
