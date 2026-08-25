import { z } from 'zod';
import { Env } from '../../index';
import { buildStatutoryComponents } from './compliance';
import { loadConfig, missingRequired } from './config';
import { requestApproval, consumeApproval } from './approvals';
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

  /** Wraps a gated action: request approval, or execute the approved payload. */
  const gated = (
    toolName: string,
    summarise: (args: any) => string,
    execute: (args: any) => Promise<string>,
  ) => async (args: any) => {
    const { approvalToken, ...payload } = args ?? {};

    if (!approvalToken) {
      const req = await requestApproval(ctx, toolName, payload, summarise(payload));
      return JSON.stringify({
        status: 'approval_required',
        approvalId: req.id,
        summary: req.summary,
        message:
          `This needs ${'the operator'}'s approval before it can run. Show them exactly what will ` +
          `happen and wait — do not retry without a token they have granted.`,
      });
    }

    const check = await consumeApproval(ctx, approvalToken, toolName, payload);
    if (!check.ok) return JSON.stringify({ status: 'refused', reason: check.reason });

    return execute(payload);
  };

  return [
    // ── Compliance configuration ──────────────────────────────────────────
    {
      name: 'get_compliance_config',
      description:
        'The operator-configured compliance settings: tax year, rates, thresholds, deadlines, ' +
        'company registration details. This is the only source of rates. Check it before quoting any figure.',
      schema: z.object({}),
      func: async () => {
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
    },

    {
      name: 'knowledge_search',
      description:
        'Searches the indexed compliance documents for rules, procedures, formats and worked ' +
        'examples. Use it to understand HOW something must be done or reported. It is NOT a source ' +
        'of rates — every number comes from get_compliance_config. If a passage states a figure ' +
        'that contradicts the configured value, report the discrepancy rather than choosing.',
      schema: z.object({
        query: z.string().describe('What you need to understand'),
        top_k: z.number().optional().describe('How many passages, default 5'),
      }),
      func: async (a: any) => {
        const result = await searchKnowledge(ctx.env, a.query, { topK: a.top_k });
        return JSON.stringify({
          passages: result.passages.map((p) => ({
            source: `${p.title} › ${p.section}`,
            relevance: Math.round(p.score * 100) / 100,
            text: p.text,
          })),
          authority: result.note,
        });
      },
    },

    {
      name: 'record_action',
      description:
        'Writes what you did and WHY into your working journal, so a later conversation can ' +
        'recover the reasoning. Record anything consequential or anything a person would later ' +
        'ask you to justify — a statement produced (including a nil one, with the reason it was ' +
        'nil), a structure set, an entry posted, or a refusal and what blocked it. Consequential ' +
        'approved actions are journalled for you automatically; this is for the reasoning behind ' +
        'them, and for everything else.',
      schema: z.object({
        action_type: z
          .string()
          .describe('e.g. statement_generated, payroll_generated, account_created, refused'),
        subject: z.string().describe('What was acted on, in human terms'),
        summary: z.string().describe('What you did'),
        rationale: z.string().optional().describe('Why — including why a figure was nil'),
        period_label: z.string().optional().describe("e.g. '2026-08' or 'TY2027'"),
        outcome: z.enum(['completed', 'refused', 'blocked']).optional(),
        entities: z.record(z.any()).optional().describe('Related record ids'),
      }),
      func: async (a: any) => {
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
    },
    {
      name: 'recall_actions',
      description:
        'Looks up what you did before and why. Give a query to search by meaning, or filters ' +
        '(action_type, period_label) for an exact answer. Check this before repeating work or ' +
        'when asked why something was done a particular way — the reasoning is recorded, so do ' +
        'not reconstruct it from memory.',
      schema: z.object({
        query: z.string().optional().describe('What you are trying to remember'),
        action_type: z.string().optional(),
        period_label: z.string().optional().describe("e.g. '2026-08'"),
        limit: z.number().optional(),
      }),
      func: async (a: any) => {
        const res = await recallActions(ctx.env, {
          query: a.query,
          actionType: a.action_type,
          periodLabel: a.period_label,
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
    },

    // ── HR: people and salary structures ──────────────────────────────────
    {
      name: 'get_employees',
      description: 'Employee records. Filter by department, or pass employee_id for one.',
      schema: z.object({
        employee_id: z.string().optional().describe('Internal employee id (emp_...)'),
        department: z.string().optional(),
      }),
      func: async (a: any) => {
        if (a.employee_id) return callApi('GET', `/api/core/employees/${a.employee_id}`);
        const qs = a.department ? `?department=${encodeURIComponent(a.department)}` : '';
        return callApi('GET', `/api/core/employees${qs}`);
      },
    },
    {
      name: 'get_salary_structure',
      description: "An employee's active salary structure and its components.",
      schema: z.object({ employee_id: z.string() }),
      func: async (a: any) => callApi('GET', `/api/hr/salary-structures/${a.employee_id}/active`),
    },
    {
      name: 'preview_salary_calculation',
      description: 'What the payroll engine would compute for an employee from their current structure.',
      schema: z.object({ employee_id: z.string() }),
      func: async (a: any) => callApi('GET', `/api/hr/salary-structures/${a.employee_id}/calculate`),
    },
    {
      name: 'build_compliant_salary_components',
      description:
        'Computes the statutory deduction components (income tax withholding, EOBI, optionally PESSI/SESSI) ' +
        'for an annual gross, strictly from the configured rates. Returns a refusal naming the missing ' +
        'setting if any required figure is unconfigured. Use this before setting any salary structure — ' +
        'never work the deductions out yourself.',
      schema: z.object({
        annual_gross: z.number().describe('Annual gross salary in PKR'),
        employee_count: z.number().describe('Total active employees — decides whether EOBI applies'),
        include_eobi: z.boolean().optional(),
        include_pessi: z.boolean().optional(),
      }),
      func: async (a: any) => {
        const result = await buildStatutoryComponents(ctx.env, {
          annualGross: a.annual_gross,
          employeeCount: a.employee_count,
          includeEobi: a.include_eobi,
          includePessi: a.include_pessi,
        });
        return JSON.stringify(result);
      },
    },
    {
      name: 'set_salary_structure',
      description:
        "Replaces an employee's salary structure. Components must come from " +
        'build_compliant_salary_components — do not hand-write deduction amounts. Needs approval.',
      schema: z.object({
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
      func: gated(
        'set_salary_structure',
        (p) =>
          `Replace the salary structure for ${p.employee_id}: base ${p.base_salary}, ` +
          `${p.components?.length ?? 0} component(s), effective ${p.effective_date}.`,
        (p) =>
          callApi('POST', `/api/hr/salary-structures/${p.employee_id}/setup`, {
            baseSalary: p.base_salary,
            effectiveDate: p.effective_date,
            components: p.components,
          }),
      ),
    },
    {
      name: 'generate_payroll',
      description:
        'Runs payroll for every active employee for a month. Consequential and organisation-wide, so it needs approval.',
      schema: z.object({
        month: z.string().describe('YYYY-MM'),
        approvalToken: z.string().optional(),
      }),
      func: gated(
        'generate_payroll',
        (p) => `Generate payroll for ALL active employees for ${p.month}.`,
        (p) => callApi('POST', '/api/hr/payroll/generate', { month: p.month }),
      ),
    },
    {
      name: 'get_payroll',
      description: 'Payroll records, optionally for one month.',
      schema: z.object({ month: z.string().optional().describe('YYYY-MM') }),
      func: async (a: any) =>
        callApi('GET', `/api/hr/payroll${a.month ? `?month=${encodeURIComponent(a.month)}` : ''}`),
    },
    {
      name: 'get_attendance',
      description: 'Attendance records, for payroll and statutory reporting.',
      schema: z.object({ employee_id: z.string().optional() }),
      func: async (a: any) =>
        callApi('GET', `/api/hr/attendance${a.employee_id ? `?employeeId=${a.employee_id}` : ''}`),
    },
    {
      name: 'get_loans',
      description: 'Employee loans — they appear as payroll deductions.',
      schema: z.object({}),
      func: async () => callApi('GET', '/api/hr/loans'),
    },

    // ── Accounting: ledgers, accounts, journals, transactions ─────────────
    {
      name: 'get_ledgers',
      description: 'All ledgers.',
      schema: z.object({}),
      func: async () => callApi('GET', '/api/finance/ledgers'),
    },
    {
      name: 'get_accounts',
      description: 'Chart of accounts, or one account by id.',
      schema: z.object({ account_id: z.string().optional() }),
      func: async (a: any) =>
        callApi('GET', a.account_id ? `/api/finance/accounts/${a.account_id}` : '/api/finance/accounts'),
    },
    {
      name: 'create_ledger',
      description:
        'Opens a new ledger. A structural change to the books, so it needs approval — never create one to make an entry fit.',
      schema: z.object({
        ledgerName: z.string(),
        description: z.string().optional(),
        approvalToken: z.string().optional(),
      }),
      func: gated(
        'create_ledger',
        (p) => `Create a new LEDGER "${p.ledgerName}".`,
        (p) => callApi('POST', '/api/finance/ledgers', p),
      ),
    },
    {
      name: 'create_account',
      description:
        'Opens a new account, optionally under a ledger. A structural change to the chart of accounts, so it needs approval.',
      schema: z.object({
        accountName: z.string(),
        accountType: z.string().optional().describe('Asset | Liability | Equity | Revenue | Expense'),
        ledgerId: z.string().optional(),
        openingBalance: z.number().optional(),
        approvalToken: z.string().optional(),
      }),
      func: gated(
        'create_account',
        (p) =>
          `Create a new ACCOUNT "${p.accountName}"${p.accountType ? ` (${p.accountType})` : ''}` +
          `${p.ledgerId ? ` linked to ledger ${p.ledgerId}` : ' with no ledger link'}.`,
        (p) => callApi('POST', '/api/finance/accounts', p),
      ),
    },
    {
      name: 'get_journals',
      description: 'General journal entries.',
      schema: z.object({ journal_id: z.string().optional() }),
      func: async (a: any) =>
        callApi('GET', a.journal_id ? `/api/finance/journals/${a.journal_id}` : '/api/finance/journals'),
    },
    {
      name: 'create_journal_entry',
      description:
        'Posts a compound double-entry journal. Debits must equal credits — the server rejects it otherwise. Needs approval.',
      schema: z.object({
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
      func: gated(
        'create_journal_entry',
        (p) => {
          const dr = (p.lines || []).filter((l: any) => l.type === 'debit').reduce((s: number, l: any) => s + l.amount, 0);
          return `Post a journal for ${p.entryDate} — "${p.narration}", ${p.lines?.length ?? 0} lines, ${dr} each side.`;
        },
        (p) => callApi('POST', '/api/finance/journals', p),
      ),
    },
    {
      name: 'get_transactions',
      description: 'Financial transactions.',
      schema: z.object({ transaction_id: z.string().optional() }),
      func: async (a: any) =>
        callApi('GET', a.transaction_id ? `/api/finance/transactions/${a.transaction_id}` : '/api/finance/transactions'),
    },
    {
      name: 'record_transaction',
      description: 'Records a financial transaction. Needs approval — it moves the books.',
      schema: z.object({
        accountId: z.string().optional(),
        amount: z.number(),
        transactionType: z.string().optional(),
        description: z.string().optional(),
        transactionDate: z.string().optional().describe('YYYY-MM-DD'),
        approvalToken: z.string().optional(),
      }),
      func: gated(
        'record_transaction',
        (p) => `Record a transaction of ${p.amount}${p.description ? ` — "${p.description}"` : ''}.`,
        (p) => callApi('POST', '/api/finance/transactions', p),
      ),
    },
    {
      name: 'get_trial_balance',
      description: 'The trial balance — the basis for most statements.',
      schema: z.object({}),
      func: async () => callApi('GET', '/api/finance/trial-balance'),
    },
    {
      name: 'get_invoices',
      description: 'Invoices, for revenue and withholding workings.',
      schema: z.object({ status: z.enum(['paid', 'unpaid', 'all']).optional() }),
      func: async (a: any) =>
        callApi('GET', `/api/finance/invoices${a.status && a.status !== 'all' ? `?status=${a.status}` : ''}`),
    },

    // ── Deliverables ──────────────────────────────────────────────────────
    {
      name: 'save_finance_document',
      description:
        'Files a generated statement in the accounting document store. Call this after uploading the ' +
        'rendered file, so the deliverable is findable where the accountant already looks.',
      schema: z.object({
        title: z.string(),
        documentType: z.string().describe('e.g. Statement, Return, Reconciliation'),
        url: z.string().describe('R2 path under finance-docs/'),
      }),
      func: async (a: any) =>
        callApi('POST', '/api/finance/documents', {
          title: a.title,
          documentType: a.documentType,
          url: a.url,
        }),
    },
    {
      name: 'get_finance_documents',
      description: 'Documents already filed in accounting.',
      schema: z.object({}),
      func: async () => callApi('GET', '/api/finance/documents'),
    },
  ];
};
